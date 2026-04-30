"""Нормализация номера Узбекистана: +998 и 9 цифр (мобильный)."""

import re


def normalize_uzbek_phone(raw: str) -> str:
    digits = "".join(re.findall(r"\d", raw.strip()))
    if digits.startswith("998"):
        rest = digits[3:]
    elif len(digits) == 9:
        rest = digits
    else:
        raise ValueError("Номер: +998 XX XXX XX XX — 9 цифр после кода страны")

    if len(rest) != 9:
        raise ValueError("Номер: +998 XX XXX XX XX — неверное количество цифр")

    return "+998" + rest
