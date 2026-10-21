from __future__ import annotations

import json
import os
from typing import TypeAlias
from urllib.parse import urlencode
from urllib.request import Request, urlopen

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]


def required_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Set {name}")
    return value


BASE_URL = required_environment("KOKORO_API_BASE_URL")
HEADERS = {
    "x-kokoro-service": "web-bff",
    "x-kokoro-internal-secret": required_environment("KOKORO_API_TOKEN"),
    "authorization": "Bearer " + required_environment("KOKORO_USER_BEARER"),
}


def require_object(value: JsonValue, label: str) -> dict[str, JsonValue]:
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be an object")
    return value


def fetch_page(cursor: str | None) -> tuple[list[str], str | None]:
    query: dict[str, str | int] = {"limit": 2}
    if cursor is not None:
        query["cursor"] = cursor
    request = Request(f"{BASE_URL}/v1/sessions?{urlencode(query)}", headers=HEADERS)
    with urlopen(request, timeout=10) as response:  # noqa: S310 -- base URL is explicit configuration.
        raw: JsonValue = json.load(response)
    envelope = require_object(raw, "response")
    data = require_object(envelope.get("data"), "response.data")
    sessions = data.get("sessions")
    if not isinstance(sessions, list):
        raise RuntimeError("response.data.sessions must be a list")
    titles: list[str] = []
    for index, session_value in enumerate(sessions):
        session = require_object(session_value, f"session[{index}]")
        title = session.get("title")
        if not isinstance(title, str):
            raise RuntimeError(f"session[{index}].title must be a string")
        titles.append(title)
    next_cursor = data.get("next_cursor")
    if next_cursor is not None and not isinstance(next_cursor, str):
        raise RuntimeError("response.data.next_cursor must be a string or null")
    return titles, next_cursor


cursor: str | None = None
for _ in range(10):
    page_titles, cursor = fetch_page(cursor)
    for page_title in page_titles:
        print(page_title)
    if cursor is None:
        break
else:
    raise RuntimeError("Pagination exceeded the ten-page example budget")
