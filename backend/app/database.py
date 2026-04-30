from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.database_url,
    echo=False,
)
async_session_factory = async_sessionmaker(
    engine,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


def _sqlite_patch_columns(sync_conn) -> None:
    """Добавляем столбцы в существующую SQLite-таблицу после смены схемы."""
    colnames = [r[1] for r in sync_conn.execute(text("PRAGMA table_info(users)")).fetchall()]

    def need(name: str) -> bool:
        return name not in colnames

    alters: list[str] = []
    if need("phone_e164"):
        alters.append("ALTER TABLE users ADD COLUMN phone_e164 VARCHAR(20)")
    if need("profile_completed"):
        alters.append("ALTER TABLE users ADD COLUMN profile_completed BOOLEAN DEFAULT 0")
    if need("age"):
        alters.append("ALTER TABLE users ADD COLUMN age INTEGER")
    if need("about"):
        alters.append("ALTER TABLE users ADD COLUMN about TEXT")
    if need("specializations"):
        alters.append("ALTER TABLE users ADD COLUMN specializations TEXT")
    if need("employer_kind"):
        alters.append("ALTER TABLE users ADD COLUMN employer_kind VARCHAR(32)")
    if need("organization_name"):
        alters.append("ALTER TABLE users ADD COLUMN organization_name VARCHAR(255)")
    if need("organization_inn"):
        alters.append("ALTER TABLE users ADD COLUMN organization_inn VARCHAR(32)")
    if need("employer_note"):
        alters.append("ALTER TABLE users ADD COLUMN employer_note TEXT")
    if need("password_hash"):
        alters.append("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)")
    if need("recovery_code_hash"):
        alters.append("ALTER TABLE users ADD COLUMN recovery_code_hash VARCHAR(255)")
    if need("recovery_expires_at"):
        alters.append("ALTER TABLE users ADD COLUMN recovery_expires_at TEXT")

    for stmt in alters:
        sync_conn.execute(text(stmt))


async def init_models() -> None:
    from pathlib import Path

    import app.models  # noqa: F401 — регистрация таблиц в Base.metadata

    if settings.database_url.startswith("sqlite"):
        Path("data").mkdir(parents=True, exist_ok=True)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if settings.database_url.startswith("sqlite"):
            await conn.run_sync(_sqlite_patch_columns)
