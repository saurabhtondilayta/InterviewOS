from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Values come from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    resume_bucket: str = "resumes"

    # AI provider: any OpenAI-compatible Chat Completions API that supports
    # response_format=json_schema (strict). Tested targets:
    #   Groq: AI_BASE_URL=https://api.groq.com/openai/v1, AI_MODEL=openai/gpt-oss-120b
    #   xAI:  AI_BASE_URL=https://api.x.ai/v1,           AI_MODEL=grok-4.7
    # The legacy XAI_* variable names are still accepted.
    ai_api_key: str = Field(default="", validation_alias=AliasChoices("AI_API_KEY", "XAI_API_KEY"))
    ai_base_url: str = Field(default="https://api.groq.com/openai/v1", validation_alias=AliasChoices("AI_BASE_URL", "XAI_BASE_URL"))
    # Model used for analysis/evaluation (quality matters) and for chat (latency/cost matters).
    ai_model: str = Field(default="openai/gpt-oss-120b", validation_alias=AliasChoices("AI_MODEL", "XAI_MODEL"))
    ai_chat_model: str = Field(default="openai/gpt-oss-120b", validation_alias=AliasChoices("AI_CHAT_MODEL", "XAI_CHAT_MODEL"))
    ai_timeout_seconds: float = Field(default=90.0, validation_alias=AliasChoices("AI_TIMEOUT_SECONDS", "XAI_TIMEOUT_SECONDS"))
    ai_max_retries: int = Field(default=2, validation_alias=AliasChoices("AI_MAX_RETRIES", "XAI_MAX_RETRIES"))
    # Sent as `reasoning_effort` when set (supported by Groq's gpt-oss models). "low" uses far fewer
    # hidden reasoning tokens, which matters on free tiers with tokens-per-minute limits.
    # Leave empty for providers/models that don't support the parameter.
    ai_reasoning_effort: str = Field(default="", validation_alias=AliasChoices("AI_REASONING_EFFORT"))

    # Voice (OpenAI-compatible audio endpoints on the same provider). Empty disables the feature.
    # Groq: Whisper for speech-to-text; Orpheus for text-to-speech (its terms must be accepted once
    # in the Groq console, otherwise the app falls back to the browser's built-in voice).
    ai_stt_model: str = Field(default="whisper-large-v3-turbo", validation_alias=AliasChoices("AI_STT_MODEL"))
    ai_tts_model: str = Field(default="canopylabs/orpheus-v1-english", validation_alias=AliasChoices("AI_TTS_MODEL"))
    ai_tts_voice: str = Field(default="troy", validation_alias=AliasChoices("AI_TTS_VOICE"))
    voice_requests_per_hour: int = 300

    # Public URL of the frontend (used in invitation emails).
    app_url: str = "http://localhost:5173"
    # Outgoing email for invitations (optional; without it invitations show in the candidate's
    # dashboard and HR can copy the invite link).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_name: str = "InterviewOS"
    # Optional TURN relay for live video on restrictive networks (comma-separated URLs).
    turn_urls: str = ""
    turn_username: str = ""
    turn_credential: str = ""
    proctoring_bucket: str = "proctoring"
    max_snapshots_per_invitation: int = 40
    max_audio_bytes: int = 4 * 1024 * 1024  # Vercel request-body limit is 4.5 MB

    # CORS: comma-separated list of allowed frontend origins
    cors_origins: str = "http://localhost:5173"

    # Per-user AI request limits (enforced from usage_logs, so they hold across instances)
    ai_requests_per_hour: int = 60
    ai_requests_per_day: int = 300
    resume_analyses_per_day: int = 10

    # 4 MB: Vercel Functions reject request bodies above 4.5 MB.
    max_resume_bytes: int = Field(default=4 * 1024 * 1024)
    signed_url_ttl_seconds: int = 120

    @field_validator("supabase_url", "ai_base_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_anon_key and self.supabase_service_role_key)

    @property
    def ai_configured(self) -> bool:
        return bool(self.ai_api_key) and not self.ai_api_key.startswith(("PASTE_", "your-"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
