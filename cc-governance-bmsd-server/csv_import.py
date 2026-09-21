"""AI Gateway CSV を day 単位で冪等に取り込む。フレームワークを import しない。"""

import csv
import os
from datetime import date
from typing import Optional

from shared import CSV_COLUMNS, coerce

_EPOCH = date(1970, 1, 1)

# CSV ヘッダ名 -> (DB 列名, 型)。source_file はヘッダを持たないため対象外
_HEADER_TO_COLUMN = {
    header: (db_name, type_str)
    for header, db_name, type_str in CSV_COLUMNS
    if header is not None
}

# cost_daily の列名（契約の並び順のまま）
_DB_COLUMNS = tuple(db_name for _, db_name, _ in CSV_COLUMNS)


def _resolve_header_index(header_row: list) -> dict:
    """ヘッダ行から CSV_COLUMNS の各ヘッダ名の列位置を解決する。欠けていれば例外にする。"""
    index_by_name = {name: i for i, name in enumerate(header_row)}
    missing = [h for h in _HEADER_TO_COLUMN if h not in index_by_name]
    if missing:
        raise ValueError(f"必須列が欠けている: {', '.join(missing)}")
    return {h: index_by_name[h] for h in _HEADER_TO_COLUMN}


def _parse_day(raw: str) -> Optional[int]:
    """`YYYY-MM-DD` と `YYYY/M/D`（ゼロ埋めなし可）を epoch 日へ変換する。解釈できなければ None。"""
    for sep in ("-", "/"):
        parts = raw.split(sep)
        if len(parts) == 3:
            break
    else:
        return None
    try:
        year_str, month_str, day_str = parts
        parsed = date(int(year_str), int(month_str), int(day_str))
    except (ValueError, TypeError, AttributeError):
        return None
    return (parsed - _EPOCH).days


def _extract_row(row: list, index_by_header: dict, source_file: str) -> Optional[dict]:
    """1 行から cost_daily の列名をキーとする dict を作る。Date が解釈できなければ None。"""
    values: dict = {"source_file": source_file}
    for header, (db_name, type_str) in _HEADER_TO_COLUMN.items():
        idx = index_by_header[header]
        raw = row[idx] if idx < len(row) else None
        if db_name == "day":
            values[db_name] = _parse_day(raw) if raw is not None else None
        else:
            values[db_name] = coerce(raw, type_str)
    if values["day"] is None:
        return None
    return values


def _read_csv_rows(path: str) -> list:
    """CRLF・UTF-8 の CSV を行のリストとして読む。"""
    with open(path, "r", encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def parse_file(path: str) -> tuple:
    """1 ファイルを読み、(抽出できた行の dict のリスト, 破棄件数) を返す。

    必須列がヘッダに無ければ例外にする（列の欠落を静かに 0 円として通さない）。
    """
    rows = _read_csv_rows(path)
    if not rows:
        return [], 0
    index_by_header = _resolve_header_index(rows[0])
    filename = os.path.basename(path)
    parsed: list = []
    dropped = 0
    for raw_row in rows[1:]:
        extracted = _extract_row(raw_row, index_by_header, filename)
        if extracted is None:
            dropped += 1
        else:
            parsed.append(extracted)
    return parsed, dropped
