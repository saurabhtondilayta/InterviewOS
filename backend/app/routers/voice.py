"""Voice endpoints: speech-to-text for spoken answers and text-to-speech for the AI interviewer.

Audio is processed in memory and never stored. Recording only happens in the browser after the
user starts it (or enables hands-free mode) and is sent here only for transcription.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from ..ai.client import get_ai
from ..auth import RequestContext, get_ctx
from ..config import get_settings
from ..errors import ValidationFailed
from ..schemas import SpeakRequest
from ..services import context as cctx

router = APIRouter(prefix="/api/voice", tags=["voice"])

_AUDIO_TYPES = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}


@router.get("/status")
def status(ctx: RequestContext = Depends(get_ctx)) -> dict:
    s = get_settings()
    return {"transcription": bool(s.ai_configured and s.ai_stt_model), "server_voice": bool(s.ai_configured and s.ai_tts_model)}


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    question_id: UUID | None = Form(default=None),
    ctx: RequestContext = Depends(get_ctx),
) -> dict:
    s = get_settings()
    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if content_type not in _AUDIO_TYPES:
        raise ValidationFailed("Unsupported audio format. Please try again or type your answer.", code="unsupported_audio")
    data = await audio.read(s.max_audio_bytes + 1)
    if len(data) > s.max_audio_bytes:
        raise ValidationFailed("That recording is too long. Keep answers under about 5 minutes.", code="audio_too_large")
    if len(data) < 1000:
        raise ValidationFailed("We didn't catch any audio. Check your microphone and try again.", code="audio_empty")

    # A short vocabulary hint (topic + the candidate's skills) improves recognition of technical terms.
    hints: list[str] = []
    if question_id:
        rows = ctx.db.table("interview_questions").select("topic").eq("id", str(question_id)).limit(1).execute().data
        if rows:
            hints.append(f"Interview answer about {rows[0]['topic']}.")
    skills = cctx.load_skills(ctx.db, ctx.user_id)
    if skills:
        hints.append("Technical terms: " + ", ".join(skills[:40]) + ".")

    text = get_ai().transcribe(
        data,
        filename=f"answer.{_AUDIO_TYPES[content_type]}",
        content_type=content_type,
        prompt=" ".join(hints) or None,
        user_id=ctx.user_id,
    )
    return {"text": text}


@router.post("/speak")
def speak(body: SpeakRequest, ctx: RequestContext = Depends(get_ctx)) -> Response:
    audio = get_ai().speak(body.text, user_id=ctx.user_id)
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})
