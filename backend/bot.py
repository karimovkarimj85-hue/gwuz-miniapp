"""GWuz — бот: приветствие и кнопка Mini App."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from dotenv import load_dotenv

_REPO = Path(__file__).resolve().parent.parent
load_dotenv(_REPO / ".env")

BOT_TOKEN = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
WEBAPP_URL = (os.getenv("WEBAPP_URL") or "").strip()


def _normalize_webapp_url(raw: str) -> str:
    u = (raw or "").strip()
    if not u:
        return ""
    if u.startswith("http://") or u.startswith("https://"):
        return u
    # BotFather требует https, поэтому помогаем если забыли схему.
    return f"https://{u.lstrip('/')}"

WELCOME_HTML = (
    "🔹 <b>Добро пожаловать в GWuz</b>\n\n"
    "Мы помогаем <b>работодателям</b> находить исполнителей, а людям — надёжные смены и понятные "
    "заказы. Со временем здесь появятся рейтинги, прозрачные цены и статусы сделок.\n\n"
    "<i>Проект создан в сотрудничестве с Gain Tech и Teplo Resurs.</i>\n\n"
    "Нажмите кнопку ниже, выберите роль <b>рабочий</b> или <b>работодатель</b>."
)


def _require_env() -> None:
    if not BOT_TOKEN:
        raise SystemExit("Задайте TELEGRAM_BOT_TOKEN в корневом .env")
    global WEBAPP_URL
    WEBAPP_URL = _normalize_webapp_url(WEBAPP_URL)
    if not WEBAPP_URL:
        raise SystemExit("Задайте WEBAPP_URL (для Telegram — HTTPS, например из ngrok)")
    if not WEBAPP_URL.startswith("https://"):
        raise SystemExit("WEBAPP_URL должен быть HTTPS для Telegram Mini App")


bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def cmd_start(message: Message) -> None:
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Открыть GWuz",
                    web_app=WebAppInfo(url=WEBAPP_URL),
                ),
            ],
        ]
    )
    await message.answer(WELCOME_HTML, reply_markup=keyboard, parse_mode="HTML")


async def main() -> None:
    _require_env()
    print("Бот GWuz запущен. WebApp:", WEBAPP_URL)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
