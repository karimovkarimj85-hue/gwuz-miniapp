from fastapi import APIRouter

import os

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    raw_token = os.environ.get("TELEGRAM_BOT_TOKEN", "NOT_FOUND")
    tok = settings.telegram_bot_token or ""
    return {
        "status": "ok",
        "bot_token_configured": bool(tok),
        "token_length": len(tok),
        "raw_env_token_length": len(raw_token),
        "raw_env_found": raw_token != "NOT_FOUND",
    }
