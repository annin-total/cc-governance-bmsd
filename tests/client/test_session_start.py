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
MARKER = "ZZMARKER-NOTICE-BODY"


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


@pytest.fixture
def notices_file(tmp_path, monkeypatch):
    """fixture の notices.json（n-001 / n-002、n-001 に一意なマーカー）を用意する。"""
    path = tmp_path / "notices.json"
    data = [
        {"id": "n-001", "title": "件名1", "body": f"本文1 {MARKER}"},
        {"id": "n-002", "title": "件名2", "body": "本文2"},
    ]
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(session_start, "_NOTICES_PATH", path)
    return path


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


def _seen_file(tmp_path) -> Path:
    return tmp_path / "state" / "seen.json"


def _write_seen(tmp_path, ids) -> None:
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ids), encoding="utf-8")


def _unread_ids() -> set:
    unread = session_start._select_unread(
        session_start._read_notices(), session_start._read_seen()
    )
    return {n["id"] for n in unread}


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


# ---- タスク 8: notices.json と未読の選別 ----


def test_notices_8_1_no_seen_file_both_unread(notices_file):
    """#8-1: seen.json が存在しない -> 未読は n-001, n-002。"""
    assert _unread_ids() == {"n-001", "n-002"}


def test_notices_8_2_partial_seen(notices_file, tmp_path):
    """#8-2: seen.json = ["n-001"] -> 未読は n-002 のみ。"""
    _write_seen(tmp_path, ["n-001"])
    assert _unread_ids() == {"n-002"}


def test_notices_8_3_all_seen(notices_file, tmp_path):
    """#8-3: seen.json = ["n-001","n-002"] -> 未読なし。"""
    _write_seen(tmp_path, ["n-001", "n-002"])
    assert _unread_ids() == set()


def test_notices_8_4_unknown_id_in_seen_is_ignored(notices_file, tmp_path):
    """#8-4: seen.json に存在しない id を含む -> 未読は n-002。例外にならない。"""
    _write_seen(tmp_path, ["n-001", "n-999"])
    assert _unread_ids() == {"n-002"}


def test_notices_8_5_seen_as_dict_is_treated_as_empty(notices_file, tmp_path):
    """#8-5: seen.json が dict -> 空集合として扱い、未読は n-001, n-002。"""
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"seen": ["n-001"]}), encoding="utf-8")
    assert _unread_ids() == {"n-001", "n-002"}


def test_notices_8_6_broken_json_is_treated_as_empty(notices_file, tmp_path):
    """#8-6: seen.json が壊れた JSON -> 空集合として扱う。"""
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('["n-001"', encoding="utf-8")
    assert _unread_ids() == {"n-001", "n-002"}


def test_notices_8_7_empty_file_is_treated_as_empty(notices_file, tmp_path):
    """#8-7: seen.json が空ファイル -> 空集合として扱う。"""
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")
    assert _unread_ids() == {"n-001", "n-002"}


def test_notices_8_8_empty_notices_array_no_unread(tmp_path, monkeypatch):
    """#8-8: notices.json が空配列 -> 未読なし。例外にならない。"""
    path = tmp_path / "notices.json"
    path.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(session_start, "_NOTICES_PATH", path)
    assert _unread_ids() == set()


def test_notices_8_9_missing_notices_file_no_unread(tmp_path, monkeypatch):
    """#8-9: notices.json が存在しない -> 未読なし。例外にならない。"""
    monkeypatch.setattr(session_start, "_NOTICES_PATH", tmp_path / "no-such-notices.json")
    assert _unread_ids() == set()


def test_notices_8_10_seen_sequence_does_not_matter(notices_file, tmp_path):
    """#8-10: seen.json = ["n-002","n-001"]（順序が逆） -> 未読なし。"""
    _write_seen(tmp_path, ["n-002", "n-001"])
    assert _unread_ids() == set()


# ---- タスク 9: お知らせの出力経路と既読を立てる順序 ----


class _RaisingStdout:
    """`write` が必ず例外を投げる標準出力の代わり。書き出し失敗を再現するために使う。"""

    def write(self, *_args, **_kwargs):
        raise OSError("boom")

    def flush(self):
        pass


def test_output_9_1_stdout_is_single_json(notices_file, capsys):
    """#9-1: 未読 2 件 -> 標準出力全体が JSON 1 個としてパースでき、余分な行が前後に無い。"""
    session_start.main()
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 1
    json.loads(lines[0])


def test_output_9_2_system_message_contains_marker(notices_file, capsys):
    """#9-2: systemMessage に ZZMARKER-NOTICE-BODY が含まれる。"""
    session_start.main()
    out = json.loads(capsys.readouterr().out)
    assert MARKER in out["systemMessage"]


def test_output_9_3_marker_not_leaked_outside_system_message(notices_file, capsys):
    """#9-3: systemMessage を除いた残りを JSON 文字列化してもマーカーを含まない。"""
    session_start.main()
    out = json.loads(capsys.readouterr().out)
    rest = {k: v for k, v in out.items() if k != "systemMessage"}
    assert MARKER not in json.dumps(rest, ensure_ascii=False)


def test_output_9_4_no_additional_context_key(notices_file, capsys):
    """#9-4: パース結果に additionalContext キーが存在しない。"""
    session_start.main()
    out = json.loads(capsys.readouterr().out)
    assert "additionalContext" not in out


def test_output_9_5_stderr_is_empty(notices_file, capsys):
    """#9-5: 標準エラーが空。main() が例外なく終わる（終了コード 0 に相当）。"""
    session_start.main()
    assert capsys.readouterr().err == ""


def test_output_9_6_no_unread_omits_system_message_key(notices_file, tmp_path, capsys):
    """#9-6: 未読なし -> systemMessage キーを出力に含めない（空文字列も出さない）。"""
    _write_seen(tmp_path, ["n-001", "n-002"])
    session_start.main()
    out = json.loads(capsys.readouterr().out)
    assert "systemMessage" not in out


def test_output_9_7_seen_file_contains_both_ids(notices_file, tmp_path, capsys):
    """#9-7: 未読 2 件を出力した後、seen.json が n-001 と n-002 を含む。"""
    session_start.main()
    capsys.readouterr()
    seen = json.loads(_seen_file(tmp_path).read_text(encoding="utf-8"))
    assert set(seen) == {"n-001", "n-002"}


def test_output_9_8_write_failure_keeps_seen_unchanged(notices_file, tmp_path):
    """#9-8: 標準出力への書き出しを例外にすると、seen.json は実行前と同じ（更新されない）ままになる。"""
    original_stdout = session_start.sys.stdout
    session_start.sys.stdout = _RaisingStdout()
    try:
        session_start.main()
    finally:
        session_start.sys.stdout = original_stdout

    assert not _seen_file(tmp_path).exists()


def test_output_9_9_retried_after_failure_shows_again(notices_file, capsys):
    """#9-9: 9-8 の失敗の後、もう一度正常に実行すると n-001, n-002 が改めて出力される。"""
    original_stdout = session_start.sys.stdout
    session_start.sys.stdout = _RaisingStdout()
    try:
        session_start.main()
    finally:
        session_start.sys.stdout = original_stdout
    capsys.readouterr()

    session_start.main()
    out = json.loads(capsys.readouterr().out)
    assert MARKER in out["systemMessage"]
    assert "本文2" in out["systemMessage"]


def test_output_9_10_existing_seen_entry_is_preserved(notices_file, tmp_path, capsys):
    """#9-10: 未読 1 件・既読 1 件 -> 実行後の seen.json が 2 件を含む（既存の既読が消えない）。"""
    _write_seen(tmp_path, ["n-001"])
    session_start.main()
    capsys.readouterr()
    seen = json.loads(_seen_file(tmp_path).read_text(encoding="utf-8"))
    assert set(seen) == {"n-001", "n-002"}


def test_output_9_11_two_items_are_joined_by_blank_line(notices_file, capsys):
    """#9-11: systemMessage は 1 つの文字列で、2 件が空行 1 つで区切られる。件ごとの接頭辞・目印を含まない。"""
    session_start.main()
    out = json.loads(capsys.readouterr().out)
    message = out["systemMessage"]
    assert isinstance(message, str)
    parts = message.split("\n\n")
    assert len(parts) == 2
    assert MARKER in parts[0]
    assert "本文2" in parts[1]
    for decoration in ("【お知らせ】", "SessionStart:"):
        assert decoration not in message
