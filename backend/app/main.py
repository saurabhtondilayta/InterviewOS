import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .errors import register_error_handlers
from .routers import account, admin, chat, companies, dashboard, interviews, learning, profile, resumes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("interviewos")


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="InterviewOS API",
        version="1.0.0",
        description="Backend for InterviewOS: resume analysis, adaptive mock interviews, coaching and progress tracking.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    register_error_handlers(app)

    # Registered before CORSMiddleware (Starlette makes later middleware the outer layer), so it
    # runs inside CORS and even crash responses carry CORS headers.
    @app.middleware("http")
    async def security_headers(request, call_next):
        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001
            # Last-resort handler. Starlette's Exception handler re-raises after responding, which
            # makes uvicorn drop the keep-alive connection; handling it here avoids that.
            logger.exception("unhandled error: %s", type(exc).__name__)
            response = JSONResponse(
                status_code=500,
                content={"error": {"code": "internal_error", "message": "Something went wrong on our side. Please try again."}},
            )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/api/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok", "supabase_configured": s.supabase_configured, "ai_configured": s.ai_configured}

    for r in (profile, resumes, companies, interviews, chat, learning, dashboard, account, admin):
        app.include_router(r.router)
    return app


app = create_app()
