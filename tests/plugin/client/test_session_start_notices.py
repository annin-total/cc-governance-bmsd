"""`session_start.py` がお知らせを開始の種類と起動形態に応じて 1 件ずつ出し、既読にする条件を検証する。

状態・設定ディレクトリは `tmp_path` で隔離し、利用者本人の `~/.claude/` には触れない。
"""

import json
import os
import stat
from pathlib import Path

import pytest
import session_start

pytestmark = pytest.mark.usefixtures("session_start_env", "spy_launch")


@pytest.fixture(autouse=True)
def _empty_settings(session_start_env):
    (session_start_env / "config").mkdir(parents=True, exist_ok=True)
    (session_start_env / "config" / "settings.json").write_text("{}", encoding="utf-8")


@pytest.fixture
def notices_file(write_notices):
    """url 付き 1 件（n-001）と url なし 2 件（n-002, n-003）を持つ notices.json を用意する。"""
    return write_notices(
        [
            {
                "id": "n-001",
                "title": "件名1",
                "body": "本文1",
                "url": "https://example.com/a",
            },
            {"id": "n-002", "title": "件名2", "body": "本文2"},
            {"id": "n-003", "title": "件名3", "body": "本文3"},
        ]
    )


def _seen_file(tmp_path) -> Path:
    return tmp_path / "state" / "seen.json"


def _seen(tmp_path) -> set:
    return set(json.loads(_seen_file(tmp_path).read_text(encoding="utf-8")))


def _set_source(monkeypatch, source) -> None:
    raw = (
        {"session_id": "s"} if source is None else {"session_id": "s", "source": source}
    )
    monkeypatch.setattr(session_start, "_read_stdin_json", lambda: raw)


def _set_entrypoint(monkeypatch, value) -> None:
    if value is None:
        monkeypatch.delenv("CLAUDE_CODE_ENTRYPOINT", raising=False)
    else:
        monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", value)


def _run_message(capsys):
    session_start.main()
    return json.loads(capsys.readouterr().out).get("systemMessage")


# ---- 開始の種類 ----


@pytest.mark.parametrize("source", ["startup", "clear"])
def test_startup_and_clear_show_first_unread_only(
    notices_file, tmp_path, monkeypatch, capsys, source
):
    _set_source(monkeypatch, source)
    assert _run_message(capsys) == "件名1\n本文1\n詳細: https://example.com/a"
    assert _seen(tmp_path) == {"n-001"}


@pytest.mark.parametrize("source", ["resume", "compact", None, "other", ["startup"]])
def test_other_sources_show_nothing_and_keep_unread(
    notices_file, tmp_path, monkeypatch, capsys, source
):
    _set_source(monkeypatch, source)
    assert _run_message(capsys) is None
    assert not _seen_file(tmp_path).exists()


def test_non_dict_stdin_shows_nothing(notices_file, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(session_start, "_read_stdin_json", lambda: ["startup"])
    assert _run_message(capsys) is None
    assert not _seen_file(tmp_path).exists()


def test_each_start_shows_next_unread_in_order(notices_file, tmp_path, capsys):
    messages = [_run_message(capsys) for _ in range(4)]
    assert messages[1:] == ["件名2\n本文2", "件名3\n本文3", None]
    assert _seen(tmp_path) == {"n-001", "n-002", "n-003"}


# ---- 起動形態 ----


@pytest.mark.parametrize("value", ["sdk-cli", "sdk-ts", "sdk-py"])
def test_headless_shows_but_keeps_unread(
    notices_file, tmp_path, monkeypatch, capsys, value
):
    _set_entrypoint(monkeypatch, value)
    assert _run_message(capsys).startswith("件名1")
    assert not _seen_file(tmp_path).exists()
    assert _run_message(capsys).startswith("件名1")


def test_headless_does_not_update_existing_seen_file(
    notices_file, tmp_path, monkeypatch, capsys
):
    _seen_file(tmp_path).parent.mkdir(parents=True, exist_ok=True)
    _seen_file(tmp_path).write_text(json.dumps(["n-001"]), encoding="utf-8")
    _set_entrypoint(monkeypatch, "sdk-cli")
    assert _run_message(capsys).startswith("件名2")
    assert _seen(tmp_path) == {"n-001"}


@pytest.mark.parametrize("value", [None, "", "cli", "claude-vscode"])
def test_non_headless_marks_shown_notice_seen(
    notices_file, tmp_path, monkeypatch, capsys, value
):
    _set_entrypoint(monkeypatch, value)
    _run_message(capsys)
    assert _seen(tmp_path) == {"n-001"}


# ---- 既読を書けない ----


def test_seen_unwritable_shows_same_notice_again(notices_file, tmp_path, capsys):
    (tmp_path / "state").write_text("blocked", encoding="utf-8")
    assert _run_message(capsys).startswith("件名1")
    assert _run_message(capsys).startswith("件名1")


@pytest.mark.skipif(
    os.name == "nt", reason="chmod によるパーミッション制御は POSIX 限定"
)
def test_seen_readonly_dir_shows_same_notice_again(notices_file, tmp_path, capsys):
    state_dir = tmp_path / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    state_dir.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        assert _run_message(capsys).startswith("件名1")
        assert _run_message(capsys).startswith("件名1")
    finally:
        state_dir.chmod(stat.S_IRWXU)
