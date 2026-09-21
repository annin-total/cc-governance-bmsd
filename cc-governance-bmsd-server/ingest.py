"""`/ingest` の受信処理。フレームワークを知らない。生のバイト列と DB 接続だけを扱う。"""

import json
from typing import Optional

from shared import EXTRA_COLUMNS, HOOK_FIELDS, POLICY_COLUMNS, coerce, to_day

_KINDS = ("event", "policy")

# events の列は EXTRA_COLUMNS + HOOK_FIELDS から組み立てる（契約が単一の正本）
_EVENTS_COLUMNS = tuple(EXTRA_COLUMNS) + tuple(
    (name, type_) for name, _, type_ in HOOK_FIELDS
)

# kind ("event" / "policy") -> (投入先テーブル, (列名, 型) の対のリスト)
_TABLE_COLUMNS = {
    "event": ("events", _EVENTS_COLUMNS),
    "policy": ("policy_state", tuple(POLICY_COLUMNS)),
}


def _row_values(obj: dict, columns: tuple) -> tuple:
    """列定義に沿って値を取り出し coerce する。`day` は `to_day(ts)` で上書きする。"""
    day = to_day(obj.get("ts"))
    values = []
    for name, type_ in columns:
        if name == "day":
            values.append(day)
        else:
            values.append(coerce(obj.get(name), type_))
    return tuple(values)


def parse_line(line: bytes) -> Optional[tuple]:
    """1 行の NDJSON を契約由来の検査にかけ、通れば (kind, 値のタプル) を返す。"""
    try:
        obj = json.loads(line)
    except ValueError:
        return None
    if not isinstance(obj, dict):
        return None
    kind = obj.get("kind")
    if kind not in _KINDS:
        return None
    if not obj.get("event_id"):
        return None
    if obj.get("ts") is None:
        return None
    _, columns = _TABLE_COLUMNS[kind]
    return kind, _row_values(obj, columns)


def _split_lines(raw: bytes) -> list:
    """バイト列を行に分割し、空白のみの行を除く（末尾改行の水増しを避ける）。"""
    return [line for line in raw.split(b"\n") if line.strip()]


def parse_lines(raw: bytes) -> tuple:
    """バイト列全体を検査し、(採用した (kind, 値のタプル) のリスト, 破棄件数) を返す。"""
    rows: list = []
    dropped = 0
    for line in _split_lines(raw):
        parsed = parse_line(line)
        if parsed is None:
            dropped += 1
        else:
            rows.append(parsed)
    return rows, dropped
