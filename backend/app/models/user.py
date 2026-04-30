import enum
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, JSON, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserRoleEnum(str, enum.Enum):
    worker = "worker"
    employer = "employer"


class EmployerKindEnum(str, enum.Enum):
    """Кто представляет интересы работодателя."""

    person = "person"  # частное лицо, разовые задачи
    organization = "organization"  # компания / организация
    frequent = "frequent"  # частый заказчик нашей платформы


class User(Base):
    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRoleEnum | None] = mapped_column(
        SAEnum(UserRoleEnum, native_enum=False, validate_strings=True),
        nullable=True,
    )

    # Уникальный логин телефона (E.164)
    phone_e164: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True)

    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Одноразовый код восстановления (хеш + срок действия)
    recovery_code_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recovery_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile_completed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Рабочий
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    about: Mapped[str | None] = mapped_column(Text, nullable=True)
    specializations: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Работодатель (направление не нужно)
    employer_kind: Mapped[EmployerKindEnum | None] = mapped_column(
        SAEnum(EmployerKindEnum, native_enum=False, validate_strings=True),
        nullable=True,
    )
    organization_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    organization_inn: Mapped[str | None] = mapped_column(String(32), nullable=True)
    employer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
