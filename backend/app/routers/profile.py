"""Регистрация профилей рабочего и работодателя."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models.user import EmployerKindEnum, User, UserRoleEnum
from app.phone_normalize import normalize_uzbek_phone
from app.schemas import RegisterEmployerBody, RegisterWorkerBody, UserOut, user_to_out
from app.password_hashing import hash_password
from app.telegram_webapp_auth import validate_init_data

router = APIRouter()


def _telegram_user_from_payload(payload: dict) -> tuple[int, str | None, str]:
    """(telegram_id, username, display_name)."""
    u = payload.get("user") or {}
    tid = int(u.get("id", 0))
    if tid <= 0:
        raise HTTPException(status_code=400, detail="В данных Telegram нет id")
    un = u.get("username")
    fn = u.get("first_name") or ""
    ln = u.get("last_name") or ""
    disp = (fn + " " + ln).strip() or un or str(tid)
    return tid, un, disp


async def _phone_conflict(session: AsyncSession, phone: str, telegram_id: int) -> None:
    r = await session.execute(
        select(User).where(User.phone_e164 == phone, User.telegram_id != telegram_id)
    )
    if r.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Этот номер уже используется в другом аккаунте")


@router.post("/worker", response_model=UserOut)
async def register_worker(
    body: RegisterWorkerBody,
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не задан")

    try:
        phone = normalize_uzbek_phone(body.phone)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    payload = validate_init_data(body.init_data, settings.telegram_bot_token.strip())
    telegram_id, username, disp = _telegram_user_from_payload(payload)

    existing = (
        await session.execute(select(User).where(User.telegram_id == telegram_id))
    ).scalar_one_or_none()

    if existing is not None and existing.profile_completed:
        raise HTTPException(status_code=409, detail="Профиль уже зарегистрирован")

    await _phone_conflict(session, phone, telegram_id)

    pwd_hash = hash_password(body.password.strip())

    if existing is None:
        row = User(
            telegram_id=telegram_id,
            username=username,
            display_name=disp,
            role=UserRoleEnum.worker,
            phone_e164=phone,
            password_hash=pwd_hash,
            age=body.age,
            about=body.about.strip(),
            specializations=body.specialization_ids,
            profile_completed=True,
        )
        session.add(row)
    else:
        row = existing
        row.username = username
        row.display_name = disp
        row.role = UserRoleEnum.worker
        row.phone_e164 = phone
        row.password_hash = pwd_hash
        row.age = body.age
        row.about = body.about.strip()
        row.specializations = body.specialization_ids
        row.employer_kind = None
        row.organization_name = None
        row.employer_note = None
        row.profile_completed = True

    await session.commit()
    await session.refresh(row)
    return user_to_out(row)


@router.post("/employer", response_model=UserOut)
async def register_employer(
    body: RegisterEmployerBody,
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN не задан")

    try:
        phone = normalize_uzbek_phone(body.phone)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    payload = validate_init_data(body.init_data, settings.telegram_bot_token.strip())
    telegram_id, username, disp = _telegram_user_from_payload(payload)

    existing = (
        await session.execute(select(User).where(User.telegram_id == telegram_id))
    ).scalar_one_or_none()

    if existing is not None and existing.profile_completed:
        raise HTTPException(status_code=409, detail="Профиль уже зарегистрирован")

    await _phone_conflict(session, phone, telegram_id)

    kind_map = {
        "person": EmployerKindEnum.person,
        "organization": EmployerKindEnum.organization,
    }
    kind = kind_map[body.employer_kind]

    org = (body.organization_name or "").strip() or None
    inn = "".join(ch for ch in (body.organization_inn or "") if ch.isdigit()) or None
    note = (body.employer_note or "").strip() or None

    pwd_hash = hash_password(body.password.strip())

    if existing is None:
        row = User(
            telegram_id=telegram_id,
            username=username,
            display_name=disp,
            role=UserRoleEnum.employer,
            phone_e164=phone,
            password_hash=pwd_hash,
            employer_kind=kind,
            organization_name=org,
            organization_inn=inn,
            employer_note=note,
            profile_completed=True,
        )
        session.add(row)
    else:
        row = existing
        row.username = username
        row.display_name = disp
        row.role = UserRoleEnum.employer
        row.phone_e164 = phone
        row.password_hash = pwd_hash
        row.employer_kind = kind
        row.organization_name = org
        row.organization_inn = inn
        row.employer_note = note
        row.age = None
        row.about = None
        row.specializations = None
        row.profile_completed = True

    await session.commit()
    await session.refresh(row)
    return user_to_out(row)
