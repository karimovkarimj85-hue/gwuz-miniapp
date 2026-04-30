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
    # В проде (Railway) DATABASE_URL обязателен. Локально задаётся в корневом .env.
    database_url: str = Field(
        ...,
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


def log_startup_settings() -> None:
    # Диагностика в логах (без вывода секретов)
    print(f"env: bot_token_configured = {bool((settings.telegram_bot_token or '').strip())}")
    scheme = (settings.database_url or "").split(":", 1)[0] if settings.database_url else ""
    print(f"env: database_url_scheme = {scheme}")
