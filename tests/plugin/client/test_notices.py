"""`_notices.py` の未読の選別・URL バリデーション・表示文字列・起動形態の判定・既読の書き込みを検証する。"""

import json
import os
import stat
from pathlib import Path

import _notices
import pytest

MARKER = "ZZMARKER-NOTICE-BODY"


@pytest.fixture
def notices_file(write_notices):
    """fixture の notices.json（n-001 / n-002、n-001 に一意なマーカー）を用意する。"""
    return write_notices(
        [
            {"id": "n-001", "title": "件名1", "body": f"本文1 {MARKER}"},
            {"id": "n-002", "title": "件名2", "body": "本文2"},
        ]
    )


@pytest.fixture
def unread_ids(monkeypatch, tmp_path):
    """状態ディレクトリを tmp_path/state に向け、未読の id 集合を返す関数を返す。"""
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))

    def _ids() -> set:
        unread = _notices._select_unread(
            _notices._read_notices(_notices._NOTICES_PATH), _notices._read_seen()
        )
        return {n["id"] for n in unread}

    return _ids


def _seen_file(tmp_path) -> Path:
    return tmp_path / "state" / "seen.json"


def _write_seen(tmp_path, ids) -> None:
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ids), encoding="utf-8")


# ---- 未読の選別 ----


def test_notices_no_seen_file_both_unread(notices_file, unread_ids):
    assert unread_ids() == {"n-001", "n-002"}


def test_notices_partial_seen(notices_file, tmp_path, unread_ids):
    _write_seen(tmp_path, ["n-001"])
    assert unread_ids() == {"n-002"}


def test_notices_all_seen(notices_file, tmp_path, unread_ids):
    _write_seen(tmp_path, ["n-001", "n-002"])
    assert unread_ids() == set()


def test_notices_unknown_id_in_seen_is_ignored(notices_file, tmp_path, unread_ids):
    _write_seen(tmp_path, ["n-001", "n-999"])
    assert unread_ids() == {"n-002"}


def test_notices_seen_as_dict_is_treated_as_empty(notices_file, tmp_path, unread_ids):
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"seen": ["n-001"]}), encoding="utf-8")
    assert unread_ids() == {"n-001", "n-002"}


def test_notices_broken_json_is_treated_as_empty(notices_file, tmp_path, unread_ids):
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('["n-001"', encoding="utf-8")
    assert unread_ids() == {"n-001", "n-002"}


def test_notices_empty_file_is_treated_as_empty(notices_file, tmp_path, unread_ids):
    path = _seen_file(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("", encoding="utf-8")
    assert unread_ids() == {"n-001", "n-002"}


def test_notices_empty_notices_array_no_unread(write_notices, unread_ids):
    write_notices([])
    assert unread_ids() == set()


def test_notices_missing_notices_file_no_unread(tmp_path, monkeypatch, unread_ids):
    monkeypatch.setattr(_notices, "_NOTICES_PATH", tmp_path / "no-such-notices.json")
    assert unread_ids() == set()


def test_notices_seen_sequence_does_not_matter(notices_file, tmp_path, unread_ids):
    _write_seen(tmp_path, ["n-002", "n-001"])
    assert unread_ids() == set()


def test_notices_non_string_body_item_is_dropped_others_survive(
    write_notices, unread_ids
):
    """title が無く body が非文字列の項目が1件混ざっても、その項目だけを飛ばし
    正常な項目は未読として残る（1件の欠陥が同じファイルの正常な項目まで隠さない）。
    """
    write_notices(
        [
            {"id": "n-broken", "body": 123},
            {"id": "n-ok", "title": "件名", "body": "本文"},
        ]
    )
    assert unread_ids() == {"n-ok"}


# ---- _valid_url: 受理 ----


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com",
        "https://example.com/path?x=1&y=2",
        "https://example.com/path#section",
        "https://example.com/%E3%81%82",
        "https://example.com/?a=1&b=2&c=3",
    ],
)
def test_valid_url_accepts_well_formed_https(url):
    assert _notices._valid_url({"url": url}) == url


# ---- _valid_url: 拒否 ----


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",  # https でない
        "javascript:alert(1)",
        "file:///etc/passwd",
        "HTTPS://example.com",  # 大文字は拒否
        "https://",  # ホストが空
        "https:///x",  # ホストが空
        "https://example.com/ x",  # 空白
        "https://example.com/\nx",  # 改行
        "https://example.com/\tx",  # タブ
        'https://example.com/"x',  # ダブルクオート
        "https://example.com/<x",
        "https://example.com/|x",
        "https://example.com/^x",
        "https://example.com/\\x",
        "https://example.com/`x",
        "https://example.com/>x",
        "https://example.com/{x",
        "https://example.com/}x",
        "https://example.com/\x7fx",  # DEL
        "https://example.com/\x00x",  # NUL
        "https://@/x",  # netloc はあるがホストが空
        "https://:443/",  # netloc はあるがホストが空
        "https://[x/",  # urlsplit が ValueError を投げる
        "https://a]b/",  # urlsplit が ValueError を投げる
        "https://example.com/あ",  # 非 ASCII
        "https://" + "a" * 2049,  # 長すぎる（2049字超）
    ],
)
def test_valid_url_rejects_malformed(url):
    """不正な URL（スキーム違反・空白・制御文字・禁止文字・非ASCII・長すぎ・ホスト空）は None。"""
    assert _notices._valid_url({"url": url}) is None


def test_valid_url_exactly_max_length_is_accepted():
    url = "https://example.com/" + "a" * (2048 - len("https://example.com/"))
    assert len(url) == 2048
    assert _notices._valid_url({"url": url}) == url


@pytest.mark.parametrize("url", [123, ["https://example.com"], None])
def test_valid_url_rejects_non_string_types(url):
    assert _notices._valid_url({"url": url}) is None


def test_valid_url_missing_key_returns_none():
    assert _notices._valid_url({}) is None


# ---- 不正な url を持つ項目の扱い ----


def test_invalid_url_item_still_shown_but_no_url_in_message():
    notice = {
        "id": "n-1",
        "title": "件名",
        "body": "本文",
        "url": "javascript:alert(1)",
    }
    message = _notices._format_message(notice)
    assert "件名" in message
    assert "本文" in message
    assert "詳細:" not in message
    assert "javascript:" not in message


# ---- _format_message: 詳細: 行 ----


def test_format_message_appends_detail_line_when_body_present():
    notice = {
        "id": "n-1",
        "title": "件名",
        "body": "本文",
        "url": "https://example.com",
    }
    message = _notices._format_message(notice)
    assert message == "件名\n本文\n詳細: https://example.com"


def test_format_message_detail_line_alone_when_body_empty():
    notice = {"id": "n-1", "title": "件名", "body": "", "url": "https://example.com"}
    message = _notices._format_message(notice)
    assert message == "件名\n詳細: https://example.com"


def test_format_message_detail_line_without_title():
    notice = {"id": "n-1", "body": "本文", "url": "https://example.com"}
    message = _notices._format_message(notice)
    assert message == "本文\n詳細: https://example.com"


def test_format_message_no_detail_line_when_url_missing():
    notice = {"id": "n-1", "title": "件名", "body": "本文"}
    message = _notices._format_message(notice)
    assert "詳細:" not in message


# ---- notices_step: source と 1 件ずつ ----


@pytest.mark.parametrize("source", ["startup", "clear"])
def test_notices_step_shows_only_first_unread(notices_file, unread_ids, source):
    output, notice, _seen = _notices.notices_step(False, source, _notices._NOTICES_PATH)
    assert notice["id"] == "n-001"
    assert output == {"systemMessage": f"件名1\n本文1 {MARKER}"}


def test_notices_step_skips_seen_and_shows_next(notices_file, tmp_path, unread_ids):
    _write_seen(tmp_path, ["n-001"])
    output, notice, seen = _notices.notices_step(
        False, "startup", _notices._NOTICES_PATH
    )
    assert notice["id"] == "n-002"
    assert output == {"systemMessage": "件名2\n本文2"}
    assert seen == {"n-001"}


@pytest.mark.parametrize(
    "source", ["resume", "compact", None, "", "other", ["startup"]]
)
def test_notices_step_other_sources_show_nothing(notices_file, unread_ids, source):
    assert _notices.notices_step(False, source, _notices._NOTICES_PATH) == (
        {},
        None,
        set(),
    )


def test_notices_step_disabled_shows_nothing(notices_file, unread_ids):
    assert _notices.notices_step(True, "startup", _notices._NOTICES_PATH) == (
        {},
        None,
        set(),
    )


def test_notices_step_all_seen_shows_nothing(notices_file, tmp_path, unread_ids):
    _write_seen(tmp_path, ["n-001", "n-002"])
    output, notice, _seen = _notices.notices_step(
        False, "startup", _notices._NOTICES_PATH
    )
    assert (output, notice) == ({}, None)


# ---- is_headless ----


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("cli", False),
        ("sdk-cli", True),
        ("sdk-ts", True),
        ("sdk-py", True),
        ("claude-vscode", False),
        ("", False),
        (None, False),
    ],
)
def test_is_headless_by_entrypoint(monkeypatch, value, expected):
    """`CLAUDE_CODE_ENTRYPOINT` が `sdk-` で始まるときだけ真。"""
    if value is None:
        monkeypatch.delenv("CLAUDE_CODE_ENTRYPOINT", raising=False)
    else:
        monkeypatch.setenv("CLAUDE_CODE_ENTRYPOINT", value)
    assert _notices.is_headless() is expected


# ---- _write_seen ----


def test_write_seen_returns_true_on_success(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))
    assert _notices._write_seen({"n-1", "n-2"}) is True
    assert (tmp_path / "state" / "seen.json").exists()


def test_write_seen_returns_false_when_state_dir_path_is_a_file(tmp_path, monkeypatch):
    blocker = tmp_path / "state-blocked"
    blocker.write_text("not a directory", encoding="utf-8")
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(blocker))
    assert _notices._write_seen({"n-1"}) is False


@pytest.mark.skipif(
    os.name == "nt", reason="chmod によるパーミッション制御は POSIX 限定"
)
def test_write_seen_returns_false_when_state_dir_readonly(tmp_path, monkeypatch):
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    state_dir.chmod(stat.S_IRUSR | stat.S_IXUSR)
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(state_dir))
    try:
        assert _notices._write_seen({"n-1"}) is False
    finally:
        state_dir.chmod(stat.S_IRWXU)
