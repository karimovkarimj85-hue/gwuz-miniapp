"""GWuz Mini App API."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import log_env_status, parse_origins, settings
from app.database import init_models
from app.routers import auth, health, meta, profile


@asynccontextmanager
async def lifespan(_: FastAPI):
    log_env_status()
    await init_models()
    yield


application = FastAPI(
        title="GWuz API",
        description="Связь работодателей и исполнителей: смены, заказы, рейтинги (Uz).",
    version="0.1.0",
    lifespan=lifespan,
)

application.add_middleware(
    CORSMiddleware,
    allow_origins=parse_origins(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

application.include_router(health.router, tags=["health"])
application.include_router(auth.router, prefix="/api", tags=["auth"])
application.include_router(profile.router, prefix="/api/profile", tags=["profile"])
application.include_router(meta.router, prefix="/api/meta", tags=["meta"])

_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
_INDEX = _STATIC_DIR / "index.html"

if _STATIC_DIR.exists():
    application.mount("/", StaticFiles(directory=str(_STATIC_DIR), html=True), name="static")


@application.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    # Не мешаем API-роутам
    if full_path.startswith("api"):
        raise HTTPException(status_code=404, detail="Not Found")
    if _INDEX.exists():
        return FileResponse(str(_INDEX))
    raise HTTPException(status_code=404, detail="Not Found")

app = application
