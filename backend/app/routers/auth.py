"""Вход и текущая сессия по Telegram Mini App."""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models.user import User
from app.password_hashing import hash_otp, hash_password, verify_otp, verify_password
from app.phone_normalize import normalize_uzbek_phone
from app.schemas import (
    ForgotPasswordRequestBody,
    LoginBody,
    ResetPasswordBody,
    UserOut,
    user_to_out,
)
from app.telegram_bot_api import FORGOT_MSG, send_bot_message_plain
from app.telegram_webapp_auth import validate_init_data

router = APIRouter()


FORGOT_GENERIC = (
    "Если номер зарегистрирован, в Telegram отправлен код проверки. Откройте чат с ботом приложения."
)


@router.post("/login", response_model=UserOut)
async def login(
    body: LoginBody,
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не задан")

    try:
        phone = normalize_uzbek_phone(body.phone)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    payload = validate_init_data(body.init_data, settings.telegram_bot_token.strip())
    user_obj = payload.get("user") or {}
    telegram_id = int(user_obj.get("id", 0))
    if telegram_id <= 0:
        raise HTTPException(status_code=400, detail="В initData нет user.id")

    result = await session.execute(select(User).where(User.phone_e164 == phone))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Номер не найден. Пройдите регистрацию.")
    if row.telegram_id != telegram_id:
        raise HTTPException(status_code=403, detail="Номер привязан к другому аккаунту Telegram")
    if not row.profile_completed:
        raise HTTPException(status_code=400, detail="Профиль не завершён — завершите регистрацию")

    if not row.password_hash:
        raise HTTPException(
            status_code=403,
            detail="У аккаунта ещё нет пароля — откройте «Забыли пароль» и задайте его по коду из Telegram.",
        )

    if not verify_password(body.password.strip(), row.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль")

    fn = user_obj.get("first_name") or ""
    ln = user_obj.get("last_name") or ""
    disp = (fn + " " + ln).strip() or row.display_name

    row.username = user_obj.get("username") or row.username
    row.display_name = disp or row.display_name
    await session.commit()
    await session.refresh(row)

    return user_to_out(row)


@router.post("/auth/forgot-code")
async def forgot_code(
    body: ForgotPasswordRequestBody,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Не раскрываем наличие номера; при успехе код уходит только в Telegram к привязанному chat_id."""
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не задан")

    try:
        phone = normalize_uzbek_phone(body.phone)
    except ValueError:
        return {"detail": FORGOT_GENERIC}

    row = (
        await session.execute(
            select(User).where(
                User.phone_e164 == phone,
                User.profile_completed == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()

    if row is None:
        return {"detail": FORGOT_GENERIC}

    code = f"{secrets.randbelow(900_000) + 100_000:06d}"
    hashed = hash_otp(code)

    txt = FORGOT_MSG.format(code=code)

    await send_bot_message_plain(row.telegram_id, txt)

    row.recovery_code_hash = hashed
    row.recovery_expires_at = datetime.now(tz=UTC) + timedelta(minutes=15)
    await session.commit()

    return {"detail": FORGOT_GENERIC}


@router.post("/auth/reset-password", response_model=UserOut)
async def reset_password(
    body: ResetPasswordBody,
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не задан")

    try:
        phone = normalize_uzbek_phone(body.phone)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    payload = validate_init_data(body.init_data, settings.telegram_bot_token.strip())
    user_obj = payload.get("user") or {}
    telegram_id = int(user_obj.get("id", 0))
    if telegram_id <= 0:
        raise HTTPException(status_code=400, detail="В initData нет user.id")

    row = (
        await session.execute(
            select(User).where(User.phone_e164 == phone, User.telegram_id == telegram_id),
        )
    ).scalar_one_or_none()

    if row is None or not row.profile_completed:
        raise HTTPException(status_code=404, detail="Не удалось выполнить сброс.")

    hashed = row.recovery_code_hash
    exp_raw = row.recovery_expires_at
    exp = (
        exp_raw.replace(tzinfo=UTC)
        if exp_raw is not None and exp_raw.tzinfo is None
        else exp_raw
    )
    if exp is not None and exp.tzinfo is not None:
        exp = exp.astimezone(UTC)
    now = datetime.now(tz=UTC)
    if not hashed or exp is None or exp < now:
        raise HTTPException(status_code=400, detail="Запросите новый код (старый не найден или просрочен).")

    code = "".join(body.code.split())
    if not verify_otp(code, hashed):
        raise HTTPException(status_code=401, detail="Неверный код.")

    pwd = body.new_password.strip()
    row.password_hash = hash_password(pwd)
    row.recovery_code_hash = None
    row.recovery_expires_at = None

    fn = user_obj.get("first_name") or ""
    ln = user_obj.get("last_name") or ""
    disp = (fn + " " + ln).strip() or row.display_name
    row.username = user_obj.get("username") or row.username
    row.display_name = disp or row.display_name

    await session.commit()
    await session.refresh(row)
    return user_to_out(row)


@router.get("/me", response_model=UserOut)
async def me(
    init_data: str = Query(..., description="initData"),

    session: AsyncSession = Depends(get_session),
) -> UserOut:
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не задан")

    payload = validate_init_data(init_data, settings.telegram_bot_token.strip())
    user_obj = payload.get("user") or {}
    telegram_id = int(user_obj.get("id", 0))

    fn = user_obj.get("first_name") or ""
    ln = user_obj.get("last_name") or ""
    telegram_disp = (fn + " " + ln).strip() or user_obj.get("username") or ""

    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    row = result.scalar_one_or_none()

    if row is None:
        return UserOut(
            telegram_id=telegram_id,
            username=user_obj.get("username"),
            display_name=telegram_disp or str(telegram_id),
            profile_completed=False,
        )

    return user_to_out(row)
