from uuid import UUID

from fastapi import APIRouter, Depends

from ..ai.client import AI_DISCLAIMER
from ..auth import RequestContext, get_ctx
from ..errors import NotFoundError
from ..schemas import ChatMessageIn, ConversationRename
from ..services import coach_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/conversations")
def list_conversations(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    return (
        ctx.db.table("chat_conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", ctx.user_id)
        .order("updated_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    conv = ctx.db.table("chat_conversations").select("*").eq("id", str(conversation_id)).limit(1).execute().data
    if not conv:
        raise NotFoundError("Conversation not found.")
    msgs = (
        ctx.db.table("chat_messages")
        .select("id, role, content, citations, created_at")
        .eq("conversation_id", str(conversation_id))
        .order("created_at")
        .execute()
        .data
        or []
    )
    return {"conversation": conv[0], "messages": msgs, "disclaimer": AI_DISCLAIMER}


@router.post("/messages")
def send(body: ChatMessageIn, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return coach_service.send_message(ctx, body.conversation_id, body.content) | {"disclaimer": AI_DISCLAIMER}


@router.patch("/conversations/{conversation_id}")
def rename(conversation_id: UUID, body: ConversationRename, ctx: RequestContext = Depends(get_ctx)) -> dict:
    rows = ctx.db.table("chat_conversations").update({"title": body.title}).eq("id", str(conversation_id)).execute().data
    if not rows:
        raise NotFoundError("Conversation not found.")
    return rows[0]


@router.delete("/conversations/{conversation_id}/messages", status_code=204)
def clear(conversation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    ctx.db.table("chat_messages").delete().eq("conversation_id", str(conversation_id)).execute()


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete(conversation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    ctx.db.table("chat_conversations").delete().eq("id", str(conversation_id)).execute()
