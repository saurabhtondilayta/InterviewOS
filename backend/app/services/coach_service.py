"""AI career coach chat with history persisted per user."""

from ..ai import prompts
from ..ai.client import get_ai
from ..ai.schemas import ConversationTitleAI
from ..auth import RequestContext
from ..config import get_settings
from ..errors import AIServiceError, AppError, NotFoundError
from . import context as cctx

HISTORY_MESSAGES = 20


def _conversation(ctx: RequestContext, conversation_id: str) -> dict:
    rows = ctx.db.table("chat_conversations").select("*").eq("id", conversation_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Conversation not found.")
    return rows[0]


def send_message(ctx: RequestContext, conversation_id: str | None, content: str) -> dict:
    content = content.strip()
    created = False
    if conversation_id:
        conv = _conversation(ctx, conversation_id)
    else:
        conv = ctx.db.table("chat_conversations").insert({"user_id": ctx.user_id, "title": "New conversation"}).execute().data[0]
        created = True

    history = (
        ctx.db.table("chat_messages")
        .select("role, content")
        .eq("conversation_id", conv["id"])
        .order("created_at", desc=True)
        .limit(HISTORY_MESSAGES)
        .execute()
        .data
        or []
    )
    history.reverse()

    user_msg = (
        ctx.admin.table("chat_messages")
        .insert({"conversation_id": conv["id"], "user_id": ctx.user_id, "role": "user", "content": content})
        .execute()
        .data[0]
    )

    system = prompts.coach_system(cctx.candidate_context(ctx.db, ctx.user_id))
    messages = [{"role": "system", "content": system}, *history, {"role": "user", "content": content}]
    try:
        reply, model = get_ai().chat(messages, user_id=ctx.user_id, feature="coach_chat")
    except AppError:
        # Roll back so a retry does not leave duplicate unanswered messages.
        ctx.admin.table("chat_messages").delete().eq("id", user_msg["id"]).eq("user_id", ctx.user_id).execute()
        if created:
            ctx.admin.table("chat_conversations").delete().eq("id", conv["id"]).eq("user_id", ctx.user_id).execute()
        raise

    assistant_msg = (
        ctx.admin.table("chat_messages")
        .insert(
            {
                "conversation_id": conv["id"],
                "user_id": ctx.user_id,
                "role": "assistant",
                "content": reply[:20000],
                "citations": [],
                "model": model,
            }
        )
        .execute()
        .data[0]
    )

    if created or conv["title"] == "New conversation":
        try:
            t, _ = get_ai().structured(
                prompts.conversation_title(content),
                ConversationTitleAI,
                user_id=ctx.user_id,
                feature="coach_title",
                check_limits=False,
                model=get_settings().ai_chat_model,
            )
            conv = (
                ctx.db.table("chat_conversations")
                .update({"title": t.title.strip()[:80] or "Conversation"})
                .eq("id", conv["id"])
                .execute()
                .data[0]
            )
        except AIServiceError:
            conv = ctx.db.table("chat_conversations").update({"title": content[:60]}).eq("id", conv["id"]).execute().data[0]
    else:
        # bump updated_at
        ctx.db.table("chat_conversations").update({"title": conv["title"]}).eq("id", conv["id"]).execute()

    return {"conversation": conv, "messages": [user_msg, assistant_msg]}
