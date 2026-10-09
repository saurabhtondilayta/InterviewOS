"""Centralised error types and handlers.

Every error response has the shape {"error": {"code": str, "message": str, "details"?: any}}.
Messages are written for end users; internal details are logged, never returned.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestAPIError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("interviewos")


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, details: object | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details


class AuthError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationFailed(AppError):
    status_code = 422
    code = "validation_failed"


class RateLimitedError(AppError):
    status_code = 429
    code = "rate_limited"


class AIServiceError(AppError):
    """The AI provider failed, timed out, or returned output that did not match the schema."""

    status_code = 502
    code = "ai_unavailable"


class ServiceNotConfigured(AppError):
    status_code = 503
    code = "not_configured"


def _body(code: str, message: str, details: object | None = None) -> dict:
    err: dict = {"code": code, "message": message}
    if details is not None:
        err["details"] = details
    return {"error": err}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.warning("app error %s: %s", exc.code, exc.message)
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Strip submitted input values from the echo so we never reflect resume text etc.
        details = [{"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg", "Invalid value")} for e in exc.errors()]
        return JSONResponse(
            status_code=422,
            content=_body("validation_failed", "Some fields are invalid.", details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body("http_error", str(exc.detail)),
        )

    @app.exception_handler(PostgrestAPIError)
    async def handle_db(_: Request, exc: PostgrestAPIError) -> JSONResponse:
        code = str(exc.code or "")
        if code == "PGRST116":
            return JSONResponse(status_code=404, content=_body("not_found", "Record not found."))
        if code == "23505":
            return JSONResponse(status_code=409, content=_body("conflict", "This record already exists."))
        if code in ("42501", "PGRST301"):
            return JSONResponse(status_code=403, content=_body("forbidden", "You do not have access to this record."))
        if code.startswith(("22", "23")):
            return JSONResponse(status_code=422, content=_body("validation_failed", "The data did not pass validation."))
        logger.error("database error code=%s", code)
        return JSONResponse(status_code=500, content=_body("database_error", "A database error occurred. Please try again."))

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content=_body("internal_error", "Something went wrong on our side. Please try again."),
        )
