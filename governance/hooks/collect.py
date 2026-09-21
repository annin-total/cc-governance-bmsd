"""全 hook 共通のイベント収集エントリ。hook の種類で分岐せず、契約のキーパスを読むだけ。"""

import time
from typing import Any

import _context
import _identity
from contract import HOOK_FIELDS, coerce, dig, to_day

_CONTEXT_TOKEN_HOOK_EVENTS = ("PreCompact", "Stop")


def extract_event(raw_input: Any, hook_event: str) -> dict[str, Any]:
    """hook 入力から送信する1行分の dict を組み立てる。

    `raw_input` が dict でない場合も例外にせず、HOOK_FIELDS 由来の列をすべて None にする。
    """
    obj = raw_input if isinstance(raw_input, dict) else {}

    ts = int(time.time())
    row: dict[str, Any] = {
        "kind": "event",
        "event_id": _identity.new_event_id(),
        "ts": ts,
        "day": to_day(ts),
        "user_email": _identity.get_user_email(),
        "host": _identity.get_host(),
        "hook_event": hook_event,
        "context_tokens": _resolve_context_tokens(obj, hook_event),
    }

    for name, path, type_str in HOOK_FIELDS:
        row[name] = coerce(dig(obj, path), type_str)

    return row


def _resolve_context_tokens(obj: dict, hook_event: str):
    """`PreCompact` / `Stop` のときだけ transcript から context_tokens を算出する。"""
    if hook_event not in _CONTEXT_TOKEN_HOOK_EVENTS:
        return None
    return _context.context_tokens(dig(obj, ("transcript_path",)))
