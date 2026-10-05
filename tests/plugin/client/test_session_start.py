"""`session_start.py` の policy イベント・実行順序・無効化スイッチを検証する。

すべて `tmp_path` と `CLAUDE_PLUGIN_DATA` / `CLAUDE_CONFIG_DIR` で隔離する。
利用者本人の `~/.claude/` には一切触れない。`claude` コマンドは実行しない。
"""

import json
import subprocess
from pathlib import Path

import _identity
import _spool
import pytest
import session_start

PCT_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
AUTOUPDATE_KEY = "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate"


def _policy_key_count() -> int:
    """`fixed_policy` が差し替えた policy の項目数。"""
    import policy

    return sum(len(t) for t in (policy.SET, policy.ADD, policy.REMOVE, policy.ONCE))


def _raiser(*_args, **_kwargs):
    raise RuntimeError("boom")


pytestmark = pytest.mark.usefixtures("session_start_env", "spy_launch", "fixed_policy")


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


def _event_rows(tmp_path) -> list:
    return [row for row in _queue_rows(tmp_path) if row.get("kind") == "event"]


# ---- policy イベントの投入 ----


def test_policy_event_count_matches_policy_items(tmp_path):
    _write_settings(tmp_path, {})
    session_start.main()
    assert len(_policy_rows(tmp_path)) == _policy_key_count()


def test_policy_event_key_names_keep_dots(tmp_path):
    _write_settings(tmp_path, {})
    session_start.main()
    assert {row["key_name"] for row in _policy_rows(tmp_path)} == {
        PCT_KEY,
        AUTOUPDATE_KEY,
    }


def test_policy_event_plugin_version_matches_plugin_json(tmp_path):
    manifest = (
        Path(session_start.__file__).resolve().parent.parent
        / ".claude-plugin"
        / "plugin.json"
    )
    expected = json.loads(manifest.read_text(encoding="utf-8"))["version"]
    _write_settings(tmp_path, {})
    session_start.main()
    assert {row["plugin_version"] for row in _policy_rows(tmp_path)} == {expected}


def test_policy_event_ids_are_distinct(tmp_path):
    _write_settings(tmp_path, {})
    session_start.main()
    ids = [row["event_id"] for row in _policy_rows(tmp_path)]
    assert len(ids) == 2
    assert len(set(ids)) == 2


def test_policy_event_parse_failed_events_are_queued(tmp_path):
    """壊れた JSON でも parse_failed の行が 2 行積まれる（未適用の端末が画面から消えない）。"""
    path = _settings_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not json", encoding="utf-8")

    session_start.main()

    rows = _policy_rows(tmp_path)
    assert len(rows) == 2
    assert {row["apply_result"] for row in rows} == {"parse_failed"}


def test_policy_event_write_failed_events_are_queued(tmp_path, monkeypatch):
    _write_settings(tmp_path, {})
    import _settings

    def _os_raiser(*_args, **_kwargs):
        raise OSError("boom")

    monkeypatch.setattr(_settings.os, "replace", _os_raiser)

    session_start.main()

    rows = {row["key_name"]: row["apply_result"] for row in _policy_rows(tmp_path)}
    assert rows[PCT_KEY] == "write_failed"
    assert len(_policy_rows(tmp_path)) == 2


def test_policy_event_queue_append_failure_does_not_leak(tmp_path, monkeypatch):
    """キューへの追記を例外にしても漏れない。設定ファイルには既に施策値が入っている。"""
    _write_settings(tmp_path, {})
    monkeypatch.setattr(_spool, "append", _raiser)

    session_start.main()

    settings = json.loads(_settings_file(tmp_path).read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"


def test_policy_event_missing_marketplace_entry_is_skipped_missing(tmp_path):
    _write_settings(tmp_path, {})
    session_start.main()
    rows = {row["key_name"]: row["apply_result"] for row in _policy_rows(tmp_path)}
    assert rows[AUTOUPDATE_KEY] == "skipped_missing"


def test_session_start_resolves_user_email_again(tmp_path, monkeypatch):
    """前回のキャッシュが残っていても、git の現在の値で policy・利用ログのイベントを送る。"""
    monkeypatch.delenv("CC_GOVERNANCE_USER_EMAIL", raising=False)
    cache = tmp_path / "state" / "identity.json"
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({"user_email": "stale@example.com"}), encoding="utf-8")
    monkeypatch.setattr(
        _identity.subprocess,
        "run",
        lambda args, **_kw: subprocess.CompletedProcess(
            args, 0, "new@example.com\n", ""
        ),
    )

    session_start.main()

    rows = _queue_rows(tmp_path)
    assert rows
    assert {row["user_email"] for row in rows} == {"new@example.com"}


# ---- 標準出力 ----


def test_stdout_and_stderr_are_empty(tmp_path, capsys):
    """SessionStart は標準出力に何も書かない（お知らせは mod が出す）。"""
    _write_settings(tmp_path, {})

    session_start.main()
    captured = capsys.readouterr()

    assert captured.out == ""
    assert captured.err == ""


# ---- 実行順序 ----


def test_order_normal_run_does_everything(tmp_path):
    _write_settings(tmp_path, {})
    session_start.main()

    settings = json.loads(_settings_file(tmp_path).read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"
    assert len(_policy_rows(tmp_path)) == _policy_key_count()
    assert len(_event_rows(tmp_path)) == 1


def test_order_collect_failure_leaves_earlier_steps_done(tmp_path, monkeypatch, capsys):
    """収集を例外にしても、設定適用は既に終わっている。標準エラーが空。"""
    _write_settings(tmp_path, {})
    monkeypatch.setattr(session_start, "_collect_step", _raiser)

    session_start.main()

    settings = json.loads(_settings_file(tmp_path).read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"
    assert capsys.readouterr().err == ""


def test_order_settings_failure_still_collects(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(session_start, "_apply_settings_step", _raiser)

    session_start.main()

    assert len(_event_rows(tmp_path)) == 1
    assert capsys.readouterr().err == ""


def test_order_both_failures_still_exit_clean(monkeypatch, capsys):
    monkeypatch.setattr(session_start, "_apply_settings_step", _raiser)
    monkeypatch.setattr(session_start, "_collect_step", _raiser)

    session_start.main()

    assert capsys.readouterr().err == ""


def test_order_call_order_is_settings_collect(monkeypatch):
    calls = []
    original_settings = session_start._apply_settings_step
    original_collect = session_start._collect_step

    def _settings_spy(*args, **kwargs):
        calls.append("settings")
        return original_settings(*args, **kwargs)

    def _collect_spy(*args, **kwargs):
        calls.append("collect")
        return original_collect(*args, **kwargs)

    monkeypatch.setattr(session_start, "_apply_settings_step", _settings_spy)
    monkeypatch.setattr(session_start, "_collect_step", _collect_spy)

    session_start.main()

    assert calls == ["settings", "collect"]


def test_order_stdin_read_failure_does_not_silence_settings(
    tmp_path, monkeypatch, capsys
):
    """標準入力の読み取りの失敗（深い入れ子で RecursionError）は収集だけに留まる。
    読み取りが収集の段の外にあると、設定の適用・キューへの記録が丸ごと消える。
    """
    _write_settings(tmp_path, {})
    monkeypatch.setattr(
        session_start,
        "_read_stdin_json",
        lambda: (_ for _ in ()).throw(RecursionError()),
    )

    session_start.main()

    assert capsys.readouterr().err == ""
    settings = json.loads(_settings_file(tmp_path).read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"
    assert len(_policy_rows(tmp_path)) == _policy_key_count()


# ---- 無効化スイッチ ----


def test_disable_unset_runs_everything(tmp_path):
    _write_settings(tmp_path, {})
    session_start.main()

    settings = json.loads(_settings_file(tmp_path).read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"
    assert len(_event_rows(tmp_path)) == 1


@pytest.mark.parametrize("value", ["1", "0", "false"])
def test_disable_nonempty_value_skips_collect_keeps_settings(
    tmp_path, monkeypatch, value
):
    """空でない値は "0" や "false" でも収集を止める。設定の適用は止めない。"""
    monkeypatch.setenv("CC_GOVERNANCE_DISABLE", value)
    _write_settings(tmp_path, {})

    session_start.main()

    settings = json.loads(_settings_file(tmp_path).read_text(encoding="utf-8"))
    assert settings["env"]["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"] == "60"
    assert _event_rows(tmp_path) == []


def test_disable_empty_value_runs_everything(tmp_path, monkeypatch):
    monkeypatch.setenv("CC_GOVERNANCE_DISABLE", "")
    _write_settings(tmp_path, {})

    session_start.main()

    assert len(_event_rows(tmp_path)) == 1


def test_disable_value_1_still_records_policy_rows(tmp_path, monkeypatch):
    monkeypatch.setenv("CC_GOVERNANCE_DISABLE", "1")
    _write_settings(tmp_path, {})

    session_start.main()

    assert len(_policy_rows(tmp_path)) == _policy_key_count()


def test_disable_value_1_still_launches_sender_once(tmp_path, monkeypatch, spy_launch):
    """値が "1" でも送信条件が真なら送信プロセスが1回起動する（送信は止まらない）。"""
    monkeypatch.setenv("CC_GOVERNANCE_DISABLE", "1")
    _write_settings(tmp_path, {})

    session_start.main()

    assert len(spy_launch) == 1
