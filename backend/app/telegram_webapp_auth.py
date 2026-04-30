"""Проверка подписи initData Telegram Web App (Bots Web Apps)."""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any
from urllib.parse import parse_qsl

from fastapi import HTTPException


def validate_init_data(init_data: str | None, bot_token: str, max_age_seconds: int = 86400) -> dict[str, Any]:
    """Проверка hash поля из сырого query-string Mini App."""

    if not init_data:
        raise HTTPException(status_code=401, detail="Нет данных Telegram Mini App")

    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)

    if not received_hash:
        raise HTTPException(status_code=401, detail="Не передан hash")

    data_check_arr = [f"{k}={parsed[k]}" for k in sorted(parsed.keys())]
    data_check_string = "\n".join(data_check_arr)

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode(),
        digestmod=hashlib.sha256,
    ).digest()
    computed_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(status_code=401, detail="Неверная подпись Telegram")

    # auth_date
    import time

    try:
        auth_date = int(parsed.get("auth_date", 0))
    except ValueError:
        raise HTTPException(status_code=401, detail="Битые данные авторизации")

    if time.time() - auth_date > max_age_seconds:
        raise HTTPException(status_code=401, detail="Сессия устарела — откройте приложение снова")

    user_payload: dict[str, Any] | None = None
    if parsed.get("user"):
        user_payload = json.loads(parsed["user"])

    return {
        "user": user_payload or {},
        "auth_date": auth_date,
    }
