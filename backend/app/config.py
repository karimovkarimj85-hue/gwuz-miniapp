"""Настройки из корневого .env монорепозитория."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    telegram_bot_token: str = ""
    jwt_secret: str = "change-me"
    database_url: str = "sqlite+aiosqlite:///./data/gw.sqlite"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,https://web.telegram.org,https://t.me"
    )


def parse_origins(raw: str) -> list[str]:
    return [x.strip() for x in raw.split(",") if x.strip()]


settings = Settings()
