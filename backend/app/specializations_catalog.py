"""Справочник направлений для исполнителей (рабочая роль)."""

from typing import TypedDict


class SpecItem(TypedDict):
    id: str
    label_ru: str


SPECIALIZATIONS: list[SpecItem] = [
    {"id": "plumber", "label_ru": "Сантехник"},
    {"id": "electrician", "label_ru": "Электрик"},
    {"id": "builder", "label_ru": "Строитель / отделка"},
    {"id": "mover", "label_ru": "Грузчики"},
    {"id": "cleaner", "label_ru": "Клининг"},
    {"id": "welder", "label_ru": "Сварщик"},
    {"id": "cook", "label_ru": "Повар"},
    {"id": "gardener", "label_ru": "Сад / участок"},
    {"id": "driver", "label_ru": "Водитель"},
    {"id": "painter", "label_ru": "Маляр / покраска"},
    {"id": "tile_setter", "label_ru": "Плиточник"},
    {"id": "hvac", "label_ru": "Кондиционеры / вентиляция"},
    {"id": "handyman", "label_ru": "Мастер на час"},
    {"id": "it", "label_ru": "IT / офисная техника"},
    {"id": "other", "label_ru": "Другое"},
]

VALID_SPEC_IDS = {x["id"] for x in SPECIALIZATIONS}
