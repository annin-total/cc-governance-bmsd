#!/usr/bin/env python3
"""tests/fixtures の settings.json のスキーマが、上流の最新版と一致するかを確かめる。

使い方: python scripts/check_settings_schema.py [--write]
        差分があれば exit 1。--write で最新版に取り直す（取り直したら pytest tests を流す）。
"""

import json
import sys
import urllib.request
from pathlib import Path

SCHEMA_URL = "https://json.schemastore.org/claude-code-settings.json"
FIXTURE = (
    Path(__file__).resolve().parent.parent
    / "tests"
    / "fixtures"
    / "claude-code-settings.schema.json"
)
TIMEOUT_SECONDS = 30


def _fetch() -> bytes:
    with urllib.request.urlopen(SCHEMA_URL, timeout=TIMEOUT_SECONDS) as response:
        return response.read()


def _describe(local: dict, latest: dict) -> list:
    """差分の要約。トップレベルのキーの増減と、それ以外に差があるかを返す。"""
    local_keys = set(local.get("properties", {}))
    latest_keys = set(latest.get("properties", {}))
    lines = [f"追加されたキー: {k}" for k in sorted(latest_keys - local_keys)]
    lines += [f"削除されたキー: {k}" for k in sorted(local_keys - latest_keys)]
    if not lines:
        lines.append("キーの増減は無いが、定義の中身に差がある")
    return lines


def main(argv: list) -> int:
    latest_bytes = _fetch()
    latest = json.loads(latest_bytes)
    local = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if local == latest:
        print(f"[OK] 固定ファイルは最新版と一致する: {SCHEMA_URL}")
        return 0
    if "--write" in argv[1:]:
        FIXTURE.write_bytes(latest_bytes)
        print(f"[OK] 最新版に取り直した: {FIXTURE}")
        return 0
    print(f"[NG] 固定ファイルが最新版と異なる: {SCHEMA_URL}")
    for line in _describe(local, latest):
        print(f"  {line}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
