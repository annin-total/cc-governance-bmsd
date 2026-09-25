"""tests/plugin/client の共通 fixture。"""

import json
import shutil
import socket
from pathlib import Path

import pytest

_PLUGIN_SRC = Path(__file__).resolve().parents[3] / "plugin"

_DEFAULT_CONFIG = {
    "ingest_url": "",
    "ingest_token": "",
    "timeout_sec": 5,
    "spool_max_bytes": 5242880,
    "spool_max_days": 7,
}


@pytest.fixture
def hooks_dir(tmp_path) -> Path:
    """`plugin/hooks` と `config.json` を一時ディレクトリへ複製し、hooks ディレクトリを返す。"""
    hooks_dst = tmp_path / "plugin" / "hooks"
    shutil.copytree(
        _PLUGIN_SRC / "hooks", hooks_dst, ignore=shutil.ignore_patterns("__pycache__")
    )
    shutil.copy(_PLUGIN_SRC / "config.json", tmp_path / "plugin" / "config.json")
    return hooks_dst


@pytest.fixture
def write_config(hooks_dir):
    """複製先の `config.json` を、既定値に `overrides` を重ねた内容で書き換える関数を返す。"""

    def _write(**overrides) -> None:
        config = {**_DEFAULT_CONFIG, **overrides}
        path = hooks_dir.parent / "config.json"
        path.write_text(json.dumps(config), encoding="utf-8")

    return _write


def _unused_port() -> int:
    """接続できないポートを 1 つ確保する（bind 直後に close する）。"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


@pytest.fixture
def unused_port():
    """呼ぶたびに接続できないポートを 1 つ返す関数。"""
    return _unused_port
