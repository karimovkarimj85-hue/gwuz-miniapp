from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.specializations_catalog import VALID_SPEC_IDS


class LoginBody(BaseModel):
    init_data: str
    phone: str
    password: str = Field(..., min_length=1, max_length=128)


class ForgotPasswordRequestBody(BaseModel):
    phone: str


class ResetPasswordBody(BaseModel):
    init_data: str
    phone: str
    code: str = Field(..., min_length=4, max_length=16)
    new_password: str = Field(..., min_length=4, max_length=128)


class RegisterWorkerBody(BaseModel):
    init_data: str
    phone: str
    password: str = Field(..., min_length=4, max_length=128)
    age: int = Field(..., ge=16, le=90)
    about: str = Field(..., min_length=2, max_length=2000)
    specialization_ids: list[str] = Field(default_factory=list)

    @field_validator("specialization_ids")
    @classmethod
    def specs_valid(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("Выберите хотя бы одно направление")
        bad = set(v) - VALID_SPEC_IDS
        if bad:
            raise ValueError(f"Неизвестные направления: {bad}")
        return v


class RegisterEmployerBody(BaseModel):
    init_data: str
    phone: str
    password: str = Field(..., min_length=4, max_length=128)
    employer_kind: Literal["person", "organization"]
    organization_name: str | None = Field(None, max_length=255)
    organization_inn: str | None = Field(None, max_length=32)
    employer_note: str | None = Field(None, max_length=2000)

    @model_validator(mode="after")
    def check_org(self) -> "RegisterEmployerBody":
        if self.employer_kind == "organization" and not (self.organization_name or "").strip():
            raise ValueError("Укажите название организации")
        if self.organization_inn:
            inn = "".join(ch for ch in self.organization_inn if ch.isdigit())
            if inn and not (9 <= len(inn) <= 14):
                raise ValueError("ИНН должен содержать 9-14 цифр")
        return self


class UserOut(BaseModel):
    telegram_id: int
    username: str | None
    display_name: str | None
    role: str | None
    phone_e164: str | None = None
    profile_completed: bool = False
    age: int | None = None
    about: str | None = None
    specializations: list[str] = Field(default_factory=list)
    employer_kind: str | None = None
    organization_name: str | None = None
    organization_inn: str | None = None
    employer_note: str | None = None


class HealthOut(BaseModel):
    status: str
    bot_token_configured: bool = False


class SpecOut(BaseModel):
    id: str
    label_ru: str


def user_to_out(row) -> UserOut:
    specs = list(row.specializations or []) if row.specializations else []

    return UserOut(
        telegram_id=row.telegram_id,
        username=row.username,
        display_name=row.display_name,
        role=row.role.value if row.role else None,
        phone_e164=row.phone_e164,
        profile_completed=bool(row.profile_completed),
        age=row.age,
        about=row.about,
        specializations=specs,
        employer_kind=row.employer_kind.value if row.employer_kind else None,
        organization_name=row.organization_name,
        organization_inn=row.organization_inn,
        employer_note=row.employer_note,
    )
