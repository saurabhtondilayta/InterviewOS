"""AI client for any OpenAI-compatible Chat Completions API (Groq, xAI Grok, ...).

The provider is chosen with AI_BASE_URL / AI_MODEL / AI_API_KEY (see app/config.py).

Responsibilities:
* keep the API key server-side,
* request schema-constrained JSON and validate it with Pydantic,
* retry transient failures (429 / 5xx / timeouts) with backoff,
* enforce per-user rate limits and log usage metadata,
* translate every failure into a clear, user-facing AIServiceError.
"""

import copy
import json
import logging
import time
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .. import usage
from ..config import get_settings
from ..errors import AIServiceError, ServiceNotConfigured

logger = logging.getLogger("interviewos.ai")

T = TypeVar("T", bound=BaseModel)

RATE_LIMIT_WAIT_BUDGET = 60.0  # seconds a request may spend waiting out provider rate limits

AI_DISCLAIMER = "AI-generated practice feedback. It may contain mistakes and is not an assessment of employability."


def to_strict_json_schema(model: type[BaseModel]) -> dict:
    """Convert a Pydantic model to a self-contained JSON schema suitable for strict mode:
    inline $refs, require every property, forbid additional properties, drop titles."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].split("/")[-1]
                return resolve(copy.deepcopy(defs[name]))
            out = {}
            for k, v in node.items():
                if k == "properties":
                    # Keys here are field names (a field may be called "title"); keep them all.
                    out[k] = {field: resolve(sub) for field, sub in v.items()}
                elif k not in ("title", "default"):
                    out[k] = resolve(v)
            if out.get("type") == "object" and "properties" in out:
                out["required"] = list(out["properties"].keys())
                out["additionalProperties"] = False
            return out
        if isinstance(node, list):
            return [resolve(n) for n in node]
        return node

    return resolve(schema)


class AIClient:
    def __init__(self, http: httpx.Client | None = None):
        self._http = http

    # -- low level -----------------------------------------------------------------
    def _client(self) -> httpx.Client:
        if self._http is None:
            s = get_settings()
            self._http = httpx.Client(
                base_url=s.ai_base_url,
                timeout=httpx.Timeout(s.ai_timeout_seconds, connect=10),
            )
        return self._http

    def _post(self, payload: dict, *, user_id: str | None, feature: str) -> dict:
        """Chat Completions request; returns the parsed JSON body."""
        s = get_settings()
        if s.ai_reasoning_effort and "reasoning_effort" not in payload:
            payload = {**payload, "reasoning_effort": s.ai_reasoning_effort}
        resp = self._send("/chat/completions", user_id=user_id, feature=feature, model=payload.get("model"), json=payload)
        return resp.json()

    def _send(
        self,
        path: str,
        *,
        user_id: str | None,
        feature: str,
        model: str | None,
        json: dict | None = None,
        files: dict | None = None,
        data: dict | None = None,
    ) -> httpx.Response:
        """POST to the provider with retries, rate-limit waits, usage logging and error translation."""
        s = get_settings()
        if not s.ai_configured:
            raise ServiceNotConfigured("The AI service is not configured. Ask the administrator to set AI_API_KEY on the backend.")

        headers = {"Authorization": f"Bearer {s.ai_api_key}"}
        attempts = s.ai_max_retries + 1
        last_error = "unknown"
        last_body = ""
        started = time.monotonic()
        rate_limit_waited = 0.0
        attempt = 0

        while attempt < attempts:
            try:
                resp = self._client().post(path, json=json, files=files, data=data, headers=headers)
            except httpx.TimeoutException:
                last_error = "timeout"
                logger.warning("AI provider timed out (attempt %d/%d)", attempt + 1, attempts)
            except httpx.HTTPError as exc:
                last_error = "network"
                logger.warning("AI provider network error (attempt %d/%d): %s", attempt + 1, attempts, type(exc).__name__)
            else:
                if resp.status_code == 200:
                    u: dict = {}
                    if resp.headers.get("content-type", "").startswith("application/json"):
                        u = (resp.json() or {}).get("usage") or {}
                    usage.record(
                        user_id,
                        feature,
                        status="ok",
                        model=model,
                        prompt_tokens=u.get("prompt_tokens"),
                        completion_tokens=u.get("completion_tokens"),
                        latency_ms=int((time.monotonic() - started) * 1000),
                    )
                    return resp
                last_error = f"http_{resp.status_code}"
                last_body = resp.text[:400]
                # Provider error bodies contain no secrets; log them so operators can see the cause.
                logger.warning("AI provider returned %s (attempt %d/%d): %s", resp.status_code, attempt + 1, attempts, resp.text[:400])
                if resp.status_code in (400, 401, 403, 404, 413, 422):
                    break  # not retryable
                if resp.status_code == 429:
                    # Per-minute quotas (e.g. free tiers) free up within seconds. Honour Retry-After
                    # for up to RATE_LIMIT_WAIT_BUDGET seconds in total before giving up; these waits
                    # don't consume the ordinary retry attempts.
                    try:
                        wait = float(resp.headers.get("retry-after", "0"))
                    except ValueError:
                        wait = 0
                    wait = min(max(wait, 2.0), 20.0) + 0.5
                    if rate_limit_waited + wait <= RATE_LIMIT_WAIT_BUDGET:
                        rate_limit_waited += wait
                        time.sleep(wait)
                        continue
                    break
            attempt += 1
            if attempt < attempts:
                time.sleep(min(2 ** (attempt - 1), 8))

        usage.record(
            user_id,
            feature,
            status="error",
            model=model,
            error_code=last_error,
            latency_ms=int((time.monotonic() - started) * 1000),
        )
        if last_error == "http_400" and "terms acceptance" in last_body:
            raise AIServiceError(
                "This AI model must be enabled by the administrator (model terms not accepted yet).", code="ai_model_unavailable"
            )
        if last_error == "http_413":
            raise AIServiceError(
                "This request is too large for the AI plan's per-minute token limit. Wait a minute and try again, or use a shorter input.",
                code="ai_rate_limited",
            )
        if last_error == "http_429":
            raise AIServiceError(
                "The AI service is busy right now (rate limited). Please wait a minute and try again.",
                code="ai_rate_limited",
            )
        if last_error in ("http_401", "http_403"):
            raise AIServiceError("The AI service rejected the server's credentials. Please contact the administrator.")
        if last_error == "timeout":
            raise AIServiceError("The AI service took too long to respond. Please try again.", code="ai_timeout")
        if last_error == "http_400":
            raise AIServiceError("The AI service could not process this request. Please try again.", code="ai_bad_request")
        raise AIServiceError("The AI service is unavailable at the moment. Please try again shortly.")

    # -- high level ----------------------------------------------------------------
    def structured(
        self,
        messages: list[dict],
        schema: type[T],
        *,
        user_id: str | None,
        feature: str,
        model: str | None = None,
        temperature: float = 0.4,
        check_limits: bool = True,
        # Upper bound on the reply (reasoning + JSON). Too low truncates large schemas; keep it
        # modest otherwise because free tiers count it against tokens-per-minute limits.
        max_tokens: int = 2500,
    ) -> tuple[T, str]:
        """Return (validated_object, model_name). Retries once with the validation errors
        fed back if the model's JSON does not satisfy the schema."""
        if check_limits and user_id:
            usage.check_rate_limit(user_id, feature)

        model_name = model or get_settings().ai_model
        json_schema = to_strict_json_schema(schema)
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema.__name__, "strict": True, "schema": json_schema},
            },
        }

        for attempt in range(2):
            try:
                data = self._post(payload, user_id=user_id, feature=feature)
            except AIServiceError as exc:
                # Some models/providers don't support strict json_schema. Fall back once to JSON
                # mode with the schema in the prompt; Pydantic validation below still applies.
                if exc.code != "ai_bad_request" or payload["response_format"]["type"] != "json_schema":
                    raise
                logger.warning("json_schema rejected by provider for %s; retrying in JSON mode", model_name)
                payload = {
                    **payload,
                    "messages": [
                        {
                            "role": "system",
                            "content": "Respond with a single JSON object that matches this JSON schema exactly:\n"
                            + json.dumps(json_schema),
                        },
                        *messages,
                    ],
                    "response_format": {"type": "json_object"},
                }
                data = self._post(payload, user_id=user_id, feature=feature)
            content = _message_content(data)
            try:
                return schema.model_validate(json.loads(content)), model_name
            except (json.JSONDecodeError, ValidationError) as exc:
                logger.warning("AI output failed validation for %s (attempt %d)", schema.__name__, attempt + 1)
                if attempt == 0:
                    payload = {
                        **payload,
                        "messages": [
                            *payload["messages"],
                            {"role": "assistant", "content": content[:4000]},
                            {
                                "role": "user",
                                "content": "That output did not match the required JSON schema: "
                                f"{_short_errors(exc)}. Return only corrected JSON.",
                            },
                        ],
                    }
        raise AIServiceError("The AI returned an incomplete response. Please try again.", code="ai_invalid_output")

    def chat(
        self,
        messages: list[dict],
        *,
        user_id: str | None,
        feature: str,
        model: str | None = None,
        temperature: float = 0.6,
        # Generous: reasoning models (e.g. gpt-oss on Groq) count reasoning tokens toward this limit.
        max_tokens: int = 4000,
    ) -> tuple[str, str]:
        if user_id:
            usage.check_rate_limit(user_id, feature)
        model_name = model or get_settings().ai_chat_model
        data = self._post(
            {"model": model_name, "messages": messages, "temperature": temperature, "max_tokens": max_tokens},
            user_id=user_id,
            feature=feature,
        )
        return _message_content(data), model_name

    # -- voice -----------------------------------------------------------------------
    def transcribe(self, audio: bytes, *, filename: str, content_type: str, prompt: str | None, user_id: str | None) -> str:
        """Speech-to-text (OpenAI-compatible /audio/transcriptions, e.g. Groq Whisper)."""
        s = get_settings()
        if not s.ai_stt_model:
            raise ServiceNotConfigured("Voice transcription is not configured on the server.")
        if user_id:
            usage.check_rate_limit(user_id, "voice_transcribe")
        form = {"model": s.ai_stt_model, "language": "en", "response_format": "json", "temperature": "0"}
        if prompt:
            form["prompt"] = prompt[:800]
        resp = self._send(
            "/audio/transcriptions",
            user_id=user_id,
            feature="voice_transcribe",
            model=s.ai_stt_model,
            files={"file": (filename, audio, content_type)},
            data=form,
        )
        return str((resp.json() or {}).get("text", "")).strip()

    def speak(self, text: str, *, user_id: str | None) -> bytes:
        """Text-to-speech (OpenAI-compatible /audio/speech). Returns WAV audio bytes."""
        s = get_settings()
        if not s.ai_tts_model:
            raise ServiceNotConfigured("Server voice is not configured.")
        if user_id:
            usage.check_rate_limit(user_id, "voice_speak")
        resp = self._send(
            "/audio/speech",
            user_id=user_id,
            feature="voice_speak",
            model=s.ai_tts_model,
            json={"model": s.ai_tts_model, "input": text, "voice": s.ai_tts_voice, "response_format": "wav"},
        )
        return resp.content


def _message_content(data: dict) -> str:
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIServiceError("The AI service returned an unexpected response.") from exc
    if not isinstance(content, str) or not content.strip():
        raise AIServiceError("The AI service returned an empty response. Please try again.")
    return content


def _short_errors(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        return "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()[:8])
    return "invalid JSON"


_default_client: AIClient | None = None


def get_ai() -> AIClient:
    global _default_client
    if _default_client is None:
        _default_client = AIClient()
    return _default_client
