"""`session_start.py` を検証する。すべて `tmp_path` と `CLAUDE_PLUGIN_DATA` / `CLAUDE_CONFIG_DIR`
で隔離する。利用者本人の `~/.claude/` には一切触れない。`claude` コマンドは実行しない。
"""

import json
from pathlib import Path

import _spool
import pytest
import session_start
from contract import POLICY

PCT_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
AUTOUPDATE_KEY = "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate"


def _raiser(*_args, **_kwargs):
    """モックとして差し込む、必ず例外を投げる関数。"""
    raise RuntimeError("boom")


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    """状態ディレクトリと設定ディレクトリを隔離する。"""
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.delenv("CC_GOVERNANCE_DISABLE", raising=False)
    return tmp_path


def _settings_file(tmp_path) -> Path:
    return tmp_path / "config" / "settings.json"


def _write_settings(tmp_path, content) -> Path:
    path = _settings_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(content), encoding="utf-8")
    return path


def _queue_rows(tmp_path) -> list:
    path = tmp_path / "state" / "queue.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def _policy_rows(tmp_path) -> list:
    return [row for row in _queue_rows(tmp_path) if row.get("kind") == "policy"]


# ---- タスク 7: policy イベントの投入 ----


def test_policy_event_7_1_count_matches_policy_items(tmp_path):
    """#7-1: 積まれる policy イベントが POLICY の項目数と同じ 2 行になる。"""
    _write_settings(tmp_path, {})
    session_start.main()
    assert len(_policy_rows(tmp_path)) == len(POLICY)


def test_policy_event_7_2_key_names_keep_dots(tmp_path):
    """#7-2: 各行の key_name が POLICY のキーそのまま（`.` を含む）。"""
    _write_settings(tmp_path, {})
    session_start.main()
    assert {row["key_name"] for row in _policy_rows(tmp_path)} == {PCT_KEY, AUTOUPDATE_KEY}


def test_policy_event_7_3_plugin_version_matches_plugin_json(tmp_path):
    """#7-3: plugin_version が plugin.json の version（0.1.0）と一致する。"""
    _write_settings(tmp_path, {})
    session_start.main()
    assert {row["plugin_version"] for row in _policy_rows(tmp_path)} == {"0.1.0"}


def test_policy_event_7_4_event_ids_are_distinct(tmp_path):
    """#7-4: 2 行の event_id が互いに異なる。"""
    _write_settings(tmp_path, {})
    session_start.main()
    ids = [row["event_id"] for row in _policy_rows(tmp_path)]
    assert len(ids) == 2
    assert len(set(ids)) == 2


def test_policy_event_7_5_parse_failed_events_are_queued(tmp_path):
    """#7-5: 壊れた JSON でも parse_failed の行が 2 行積まれる（未適用の端末が画面から消えない）。"""
    path = _settings_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not json", encoding="utf-8")

    session_start.main()

    rows = _policy_rows(tmp_path)
    assert len(rows) == 2
    assert {row["apply_result"] for row in rows} == {"parse_failed"}


def test_policy_event_7_6_write_failed_events_are_queued(tmp_path, monkeypatch):
    """#7-6: 書き込みを失敗させても write_failed の行が積まれる（タスク 4-9 と同じ失敗）。"""
    _write_settings(tmp_path, {})
    import _settings

    def _os_raiser(*_args, **_kwargs):
        raise OSError("boom")

    monkeypatch.setattr(_settings.os, "replace", _os_raiser)

    session_start.main()

    rows = {row["key_name"]: row["apply_result"] for row in _policy_rows(tmp_path)}
    assert rows[PCT_KEY] == "write_failed"
    assert len(_policy_rows(tmp_path)) == 2


def test_policy_event_7_7_queue_append_failure_does_not_leak(tmp_path, monkeypatch):
    """#7-7: キューへの追記を例外にしても漏れない。設定ファイルには既にポリシー値が入っている。"""
    _write_settings(tmp_path, {})
    monkeypatch.setattr(_spool, "append", _raiser)

    session_start.main()

    settings = json.loads(_settings_file(tmp_path).read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"


def test_policy_event_7_8_missing_marketplace_entry_is_skipped_missing(tmp_path):
    """#7-8: extraKnownMarketplaces が無い状態では …autoUpdate が skipped_missing として積まれる。"""
    _write_settings(tmp_path, {})
    session_start.main()
    rows = {row["key_name"]: row["apply_result"] for row in _policy_rows(tmp_path)}
    assert rows[AUTOUPDATE_KEY] == "skipped_missing"
