"""Runtime settings.

Важно:
- На Railway берём значения ТОЛЬКО из переменных окружения (не из .env).
- Локально подгружаем корневой .env через python-dotenv.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _ROOT / ".env"

# Локальная разработка: подгружаем .env вручную.
# На Railway это не делаем, чтобы не было конфликтов/маскировки env.
if not os.getenv("RAILWAY_ENVIRONMENT") and _ENV_FILE.exists():
    load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=None,  # НЕ читать .env файл на Railway
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    telegram_bot_token: str = ""
    database_url: str
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    cors_origins: str = ""
    webapp_url: str = ""


def parse_origins(raw: str) -> list[str]:
    return [x.strip() for x in raw.split(",") if x.strip()]


settings = Settings()


def log_env_status() -> None:
    s = Settings()
    print(f"[CONFIG] bot_token_configured = {bool((s.telegram_bot_token or '').strip())}")
    scheme = s.database_url.split(":", 1)[0] if (s.database_url or "") else "NOT SET"
    print(f"[CONFIG] database_url_scheme = {scheme}")
    shown = (s.cors_origins or "")[:50] if (s.cors_origins or "") else "NOT SET"
    print(f"[CONFIG] cors_origins = {shown}")
