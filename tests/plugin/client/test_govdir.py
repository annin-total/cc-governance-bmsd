"""`<config_dir>/governance/` 配下（statusline.js の同期）を検証する。

`CLAUDE_CONFIG_DIR` を tmp_path に向ける。利用者本人の `~/.claude/` には触れない。
"""

import json
from pathlib import Path

import _govdir
import pytest
import session_start


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))
    (tmp_path / "config").mkdir()


def test_statuslineは内容が違うときだけ複製する(tmp_path):
    src = tmp_path / "statusline.js"
    src.write_text("v1", encoding="utf-8")
    gov = _govdir.governance_dir()
    dst = gov / "statusline.js"

    _govdir.sync_statusline(gov, src)
    assert dst.read_text(encoding="utf-8") == "v1"
    mtime = dst.stat().st_mtime_ns
    _govdir.sync_statusline(gov, src)
    assert dst.stat().st_mtime_ns == mtime
    src.write_text("v2", encoding="utf-8")
    _govdir.sync_statusline(gov, src)
    assert dst.read_text(encoding="utf-8") == "v2"


def test_statuslineの同梱ファイルが無くても落ちない(tmp_path):
    _govdir.sync_statusline(_govdir.governance_dir(), tmp_path / "missing.js")
    assert not _govdir.governance_dir().exists()


def test_statuslineの同期の失敗は設定の適用に波及しない(monkeypatch, capsys):
    """同期が例外を投げても、設定の適用・hook 出力・収集は行われる。"""

    def _raise(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(_govdir, "sync_statusline", _raise)
    monkeypatch.setattr(session_start.sys, "argv", ["session_start.py", "SessionStart"])
    monkeypatch.setattr(session_start, "_read_stdin_json", lambda: {"session_id": "s"})
    monkeypatch.setattr(session_start._spool, "should_send", lambda: False)

    session_start.main()

    settings = json.loads(_govdir.settings_path().read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"
    json.loads(capsys.readouterr().out)
    assert (_govdir.config_dir().parent / "state" / "queue.jsonl").is_file()


def test_SessionStartがstatuslineを配置する(monkeypatch):
    """同梱の statusline.js が、SessionStart の後に <config_dir>/governance/ にある。"""
    monkeypatch.setattr(session_start.sys, "argv", ["session_start.py", "SessionStart"])
    monkeypatch.setattr(session_start, "_read_stdin_json", lambda: {"session_id": "s"})
    monkeypatch.setattr(session_start._spool, "should_send", lambda: False)
    src = (
        Path(_govdir.__file__).resolve().parent.parent / "statusline" / "statusline.js"
    )

    session_start.main()

    dst = _govdir.governance_dir() / "statusline.js"
    assert dst.read_bytes() == src.read_bytes()
