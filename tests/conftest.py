"""pytest の共通設定。サーバと端末プラグインのモジュールを import 可能にする。"""

import json
import os
import sys
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

# `plugin/` はそのままマーケットプレイスへ差し込まれる配布物である。
# テストが import すると同ディレクトリに `__pycache__` が残り、配布物を汚す。
# `sys.dont_write_bytecode` は親プロセスにしか効かないため、hook を subprocess で
# 起動するテストのために環境変数も立てる（子プロセスが継承する）。
sys.dont_write_bytecode = True
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "cc-governance-bmsd-server"))
sys.path.insert(0, str(ROOT / "plugin" / "hooks"))

HOOK_INPUTS_DIR = ROOT / "tests" / "fixtures" / "hook_inputs"


def iter_hook_inputs(hook_event_name: str) -> Iterator[dict]:
    """`hook_event_name` に一致する fixture を、ファイル名の昇順で 1 件ずつ返す。"""
    for path in sorted(HOOK_INPUTS_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            obj = json.load(f)
        if obj.get("hook_event_name") == hook_event_name:
            yield obj


@pytest.fixture
def hook_inputs():
    """hook 種別を渡すと、その種別の fixture を 1 件ずつ返すイテレータを作る関数。"""
    return iter_hook_inputs


@pytest.fixture
def sqlite_db_dsn():
    """DB_DSN を一時 SQLite ファイルに向け、テスト終了後に元へ戻す。"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "test.db"
        dsn = f"sqlite:///{db_path}"
        original = os.environ.get("DB_DSN")
        os.environ["DB_DSN"] = dsn
        try:
            yield dsn
        finally:
            if original is None:
                os.environ.pop("DB_DSN", None)
            else:
                os.environ["DB_DSN"] = original
