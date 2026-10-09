"""`session_start.py` の各段の失敗が、決まった stage と例外クラス名だけの error 行として積まれることを検証する。"""

import json
from pathlib import Path

import _govdir
import _identity
import _notices
import pytest
import session_start

pytestmark = pytest.mark.usefixtures("session_start_env", "spy_launch")

_MARKER = "ZZMARKER-ERROR-MESSAGE"
_ERROR_KEYS = {
    "kind",
    "event_id",
    "ts",
    "day",
    "user_email",
    "host",
    "hook_event",
    "plugin_version",
    "stage",
    "error_type",
}


class _InjectedError(Exception):
    pass


def _raiser(*_args, **_kwargs):
    raise _InjectedError(_MARKER)


def _raise_on_refresh(refresh=False):
    """再解決（`refresh=True`）だけ失敗させる。error 行の組み立て自体は通す。"""
    if refresh:
        raise _InjectedError(_MARKER)
    return "user@example.com"


def _error_rows(tmp_path) -> list:
    path = tmp_path / "state" / "queue.jsonl"
    if not path.exists():
        return []
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    return [row for row in rows if row.get("kind") == "error"]


def _plugin_version() -> str:
    manifest = Path(session_start.__file__).resolve().parents[1] / ".claude-plugin"
    return json.loads((manifest / "plugin.json").read_text(encoding="utf-8"))["version"]


# (差し替える対象のモジュール, 属性名, 差し替え先, 期待する stage)
_STAGE_CASES = {
    "identity": (_identity, "get_user_email", _raise_on_refresh, "identity"),
    "statusline": (_govdir, "sync_statusline", _raiser, "statusline"),
    "apply_settings": (
        session_start,
        "_apply_settings_step",
        _raiser,
        "apply_settings",
    ),
    "notices": (_notices, "notices_step", _raiser, "notices"),
    "mark_seen": (session_start, "_mark_seen", _raiser, "mark_seen"),
    "collect": (session_start, "_collect_step", _raiser, "collect"),
}


@pytest.mark.parametrize(
    ("module", "attr", "replacement", "stage"),
    _STAGE_CASES.values(),
    ids=_STAGE_CASES.keys(),
)
def test_stage_failure_queues_one_error_row(
    write_notices, tmp_path, monkeypatch, capsys, module, attr, replacement, stage
):
    write_notices([{"id": "n-001", "title": "件名", "body": "本文"}])
    monkeypatch.setattr(module, attr, replacement)

    session_start.main()
    captured = capsys.readouterr()

    assert captured.err == ""
    rows = _error_rows(tmp_path)
    assert [(r["stage"], r["error_type"]) for r in rows] == [(stage, "_InjectedError")]
    row = rows[0]
    assert set(row) == _ERROR_KEYS
    assert row["hook_event"] == "SessionStart"
    assert row["plugin_version"] == _plugin_version()
    assert _MARKER not in json.dumps(row)


def test_normal_run_queues_no_error_row(write_notices, tmp_path, capsys):
    write_notices([{"id": "n-001", "title": "件名", "body": "本文"}])

    session_start.main()
    capsys.readouterr()

    assert _error_rows(tmp_path) == []


def test_error_row_append_failure_does_not_leak(tmp_path, monkeypatch, capsys):
    """記録の組み立てが失敗しても、例外も標準エラーも外に出ない。"""
    monkeypatch.setattr(session_start, "_collect_step", _raiser)
    monkeypatch.setattr(_identity, "new_event_id", _raiser)

    session_start.main()

    assert capsys.readouterr().err == ""


def test_error_row_is_queued_even_if_user_email_fails(tmp_path, monkeypatch):
    """識別子の解決が失敗しても、user_email を空にして error 行を積む。"""
    import collect

    monkeypatch.setattr(_identity, "get_user_email", _raiser)

    collect.append_error("identity", "_InjectedError", "SessionStart")

    rows = _error_rows(tmp_path)
    assert [(r["stage"], r["user_email"]) for r in rows] == [("identity", None)]
