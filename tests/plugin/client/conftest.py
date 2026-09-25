"""tests/plugin/client の共通 fixture。"""

import json
import os
import shutil
import socket
import subprocess
import sys
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


@pytest.fixture
def run_collect(hooks_dir):
    """複製した collect.py を subprocess で起動する関数を返す。

    環境は `os.environ` を継承する（セッションの隔離 HOME も引き継ぐ）。無効化スイッチは外し、
    `env` で個別に上書きする。標準入力は `stdin`（文字列）・`stdin_bytes`・`close_stdin` のいずれか。
    """

    def _run(
        *argv,
        plugin_data=None,
        stdin="{}",
        stdin_bytes=None,
        close_stdin=False,
        env=None,
        timeout=15,
    ):
        run_env = os.environ.copy()
        run_env.pop("CC_GOVERNANCE_DISABLE", None)
        if plugin_data is not None:
            run_env["CLAUDE_PLUGIN_DATA"] = str(plugin_data)
        else:
            run_env.pop("CLAUDE_PLUGIN_DATA", None)
        run_env.update(env or {})

        if close_stdin:
            input_kwargs = {"stdin": subprocess.DEVNULL}
        elif stdin_bytes is not None:
            input_kwargs = {"input": stdin_bytes}
        else:
            input_kwargs = {"input": stdin, "text": True}

        return subprocess.run(
            [sys.executable, str(hooks_dir / "collect.py"), *argv],
            capture_output=True,
            env=run_env,
            timeout=timeout,
            check=False,
            **input_kwargs,
        )

    return _run


# --- session_start.main をプロセス内で呼ぶテスト用 ---


@pytest.fixture
def session_start_env(monkeypatch, tmp_path):
    """状態・設定ディレクトリを隔離し、無効化スイッチを消し、SessionStart の入力を固定する。"""
    import session_start

    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.delenv("CC_GOVERNANCE_DISABLE", raising=False)
    monkeypatch.setattr(session_start.sys, "argv", ["session_start.py", "SessionStart"])
    monkeypatch.setattr(
        session_start,
        "_read_stdin_json",
        lambda: {"session_id": "s", "source": "startup"},
    )
    return tmp_path


@pytest.fixture
def spy_launch(monkeypatch):
    """送信プロセスの実起動を避け、呼び出しの有無だけを数える。"""
    import _sender

    calls = []
    monkeypatch.setattr(_sender, "launch", lambda: calls.append(1))
    return calls


@pytest.fixture
def write_notices(tmp_path, monkeypatch):
    """渡した項目で notices.json を書き、読み込み先をそこへ向ける関数を返す。"""
    import _notices

    def _write(data) -> Path:
        path = tmp_path / "notices.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(_notices, "_NOTICES_PATH", path)
        return path

    return _write


class _RaisingStdout:
    """`write` が必ず例外を投げる標準出力の代わり。"""

    def write(self, *_args, **_kwargs):
        raise OSError("boom")

    def flush(self):
        pass


class _FlushRaisingStdout:
    """`write` は成功するが `flush` が必ず例外を投げる標準出力の代わり。"""

    def write(self, *_args, **_kwargs):
        pass

    def flush(self):
        raise OSError("boom")


@pytest.fixture
def raising_stdout():
    """`write` が必ず例外を投げる標準出力の代わり。"""
    return _RaisingStdout()


@pytest.fixture
def flush_raising_stdout():
    """`write` は成功するが `flush` が必ず例外を投げる標準出力の代わり。"""
    return _FlushRaisingStdout()


_ALL_HOOK_EVENTS = (
    "PostToolUse",
    "UserPromptSubmit",
    "Stop",
    "SessionStart",
    "SessionEnd",
    "UserPromptExpansion",
    "PostToolUseFailure",
    "PreCompact",
)


@pytest.fixture
def all_hook_inputs(hook_inputs) -> list:
    """全 hook 種別の fixture を、種別の順に 1 リストにまとめる。

    空だと、これを回すテストが空ループを素通りして緑になるため、空でないことを確かめる。
    """
    inputs = [raw for ev in _ALL_HOOK_EVENTS for raw in hook_inputs(ev)]
    assert inputs, "hook 入力の fixture が 1 件も読めない"
    return inputs


@pytest.fixture
def seed_spool_bytes():
    """spool/ に指定サイズ・mtime のファイルを置く関数を返す（破棄の検査用）。"""
    import _spool

    def _seed(name, size_bytes, mtime) -> Path:
        spool_dir = _spool._spool_dir()
        spool_dir.mkdir(parents=True, exist_ok=True)
        path = spool_dir / name
        path.write_bytes(b"x" * size_bytes)
        os.utime(path, (mtime, mtime))
        return path

    return _seed
