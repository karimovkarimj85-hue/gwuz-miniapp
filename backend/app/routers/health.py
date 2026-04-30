from fastapi import APIRouter

from app.config import settings
from app.schemas import HealthOut

router = APIRouter()


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(status="ok", bot_token_configured=bool((settings.telegram_bot_token or "").strip()))
