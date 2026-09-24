"""`<config_dir>/governance/` 配下（settings.json のバックアップ・statusline.js の同期）を検証する。

`CLAUDE_CONFIG_DIR` を tmp_path に向ける。利用者本人の `~/.claude/` には触れない。
"""

import json
from types import SimpleNamespace

import _govdir
import _settings
import pytest
import session_start


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))
    (tmp_path / "config").mkdir()


def _apply(value) -> str:
    """`n` を value にする SET を 1 つだけ当て、その apply_result を返す。"""
    policy = SimpleNamespace(SET={"n": value}, ADD={}, REMOVE={}, ONCE={})
    rows = _settings.apply_settings(
        _govdir.settings_path(), policy, _govdir.governance_dir()
    )
    return rows[0][3]


def _backups() -> list:
    return sorted((_govdir.governance_dir() / "backups").glob("*"))


def test_書き換える直前の内容を丸ごと保存し10世代だけ残す():
    _govdir.settings_path().write_text('{"n": 0, "keep": "x"}', encoding="utf-8")
    for i in range(1, 13):
        assert _apply(i) == "applied"

    backups = _backups()
    assert len(backups) == 10
    kept = [json.loads(p.read_text(encoding="utf-8"))["n"] for p in backups]
    assert kept == list(range(2, 12)), "直近 10 世代（書き換え前の内容）が古い順に並ぶ"


def test_差分が無ければ保存しない():
    _govdir.settings_path().write_text('{"n": 1}', encoding="utf-8")
    assert _apply(1) == "already_ok"
    assert _backups() == []


def test_元のファイルが無ければ保存せずに書く():
    assert _apply(1) == "applied"
    assert _backups() == []


def test_保存に失敗したら書かない():
    raw = '{"n": 0}'
    _govdir.settings_path().write_text(raw, encoding="utf-8")
    _govdir.governance_dir().mkdir()
    (_govdir.governance_dir() / "backups").write_text(
        "", encoding="utf-8"
    )  # dir を作れない

    assert _apply(1) == "write_failed"
    assert _govdir.settings_path().read_text(encoding="utf-8") == raw
    assert sorted(p.name for p in _govdir.config_dir().iterdir()) == [
        "governance",
        "settings.json",
    ]


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
