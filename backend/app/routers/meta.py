"""Справочники для форм."""

from fastapi import APIRouter

from app.schemas import SpecOut
from app.specializations_catalog import SPECIALIZATIONS

router = APIRouter()


@router.get("/specializations", response_model=list[SpecOut])
async def list_specializations() -> list[SpecOut]:
    return [SpecOut(**x) for x in SPECIALIZATIONS]
