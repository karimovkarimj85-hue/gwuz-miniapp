from fastapi import APIRouter

import os

from app.config import settings
from app.schemas import HealthOut

router = APIRouter()


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    tok = (settings.telegram_bot_token or "").strip()
    return HealthOut(
        status="ok",
        bot_token_configured=bool(tok),
        token_length=len(tok),
        env_has_TELEGRAM_BOT_TOKEN="TELEGRAM_BOT_TOKEN" in os.environ,
        env_has_telegram_bot_token="telegram_bot_token" in os.environ,
    )
