"""Настройки из корневого .env монорепозитория."""

from pathlib import Path

from pydantic import AliasChoices, Field
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

    telegram_bot_token: str = Field(
        default="",
        validation_alias=AliasChoices("TELEGRAM_BOT_TOKEN", "telegram_bot_token"),
    )
    jwt_secret: str = Field(
        default="change-me",
        validation_alias=AliasChoices("JWT_SECRET", "jwt_secret"),
    )
    database_url: str = Field(
        default="sqlite+aiosqlite:///./data/gw.sqlite",
        validation_alias=AliasChoices("DATABASE_URL", "database_url"),
    )
    cors_origins: str = Field(
        default=(
        "http://localhost:5173,http://127.0.0.1:5173,https://web.telegram.org,https://t.me"
        ),
        validation_alias=AliasChoices("CORS_ORIGINS", "cors_origins"),
    )


def parse_origins(raw: str) -> list[str]:
    return [x.strip() for x in raw.split(",") if x.strip()]


settings = Settings()
