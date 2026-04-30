"""Вызовы HTTPS API Telegram Bot (отправка сообщений пользователю)."""

import httpx
from fastapi import HTTPException

from app.config import settings


FORGOT_MSG = (
    "Код GWuz для установки пароля или смены пароля:\n<code>{code}</code>\n"
    "Действует 15 минут.\nЕсли это не вы — просто удалите сообщение."
)


async def send_bot_message_plain(chat_id: int, text: str) -> None:
    tok = settings.telegram_bot_token.strip()
    if not tok:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не задан")
    url = f"https://api.telegram.org/bot{tok}/sendMessage"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            url,
            json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
            },
        )
    if r.status_code != 200:
        err_t = r.text[:800] if r.text else str(r.status_code)
        if r.status_code == 403:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Бот не может написать вам: напишите боту /start в Telegram "
                    "(откройте чат бота приложения)."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Telegram Bot API: {err_t}")
