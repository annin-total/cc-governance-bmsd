"""`notices.json`（mod が読むお知らせの配列）の形式検査。"""

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from plugin_checks.report import ng, ok

_REQUIRED_STR_KEYS = ("title", "body")
_URL_SCHEME = "https://"
_URL_MAX_LENGTH = 2048
# mod（hooks/notices.tsx）が表示しない URL の文字。空白・制御文字と、引数やシェルの区切りになりうる文字と、
# 角括弧（IPv6 の表記。urlsplit の扱いが Python の版で違い、mod と判定がずれる）
_URL_FORBIDDEN_CHARS = (
    frozenset('"<>\\^`|{}[]') | {chr(c) for c in range(0x21)} | {"\x7f"}
)


def _url_ok(url: Any) -> bool:
    """mod がリンクとして表示する URL なら真。mod と同じく小文字の `https://` で始まることを求める。"""
    if not isinstance(url, str) or not url.startswith(_URL_SCHEME):
        return False
    if len(url) > _URL_MAX_LENGTH or not url.isascii():
        return False
    if any(c in _URL_FORBIDDEN_CHARS for c in url):
        return False
    try:
        return bool(urlsplit(url).hostname)
    except ValueError:
        return False


def _item_errors(item: Any, seen_ids: set) -> list:
    """1 要素の問題を文字列で返す。`seen_ids` には正常な id を足す。"""
    if not isinstance(item, dict):
        return ["要素がオブジェクトでない"]
    errors = []
    item_id = item.get("id")
    if not isinstance(item_id, str) or not item_id:
        errors.append("id が非空の文字列でない")
    elif item_id in seen_ids:
        errors.append(f"id が重複: {item_id}")
    else:
        seen_ids.add(item_id)
    errors += [
        f"{key} が文字列でない"
        for key in _REQUIRED_STR_KEYS
        if not isinstance(item.get(key), str)
    ]
    if "label" in item and not isinstance(item["label"], str):
        errors.append("label が文字列でない")
    if "url" in item and not _url_ok(item["url"]):
        errors.append(
            "url が mod の表示できる形でない（https・ホストあり・ASCII・空白や区切り文字なし・2048 字以内）"
        )
    return errors


# --- notices.json: 配列・id の一意・title と body は必須・url は mod が表示できる形 ---
def check_notices_json(plugin_dir: Path) -> None:
    path = plugin_dir / "notices.json"
    if not path.is_file():
        ng(f"notices.json が存在しない: {path}")
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        ng("notices.json: パース不可")
        return
    if not isinstance(data, list):
        ng("notices.json: 配列でない")
        return
    seen_ids: set = set()
    failed = False
    for index, item in enumerate(data):
        for message in _item_errors(item, seen_ids):
            ng(f"notices.json[{index}]: {message}")
            failed = True
    if not failed:
        ok("notices.json: 形式が正しい")
