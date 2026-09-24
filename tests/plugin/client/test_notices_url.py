"""`_notices.py` の URL バリデーション（`_valid_url`）と、URL を含む出力経路を検証する。"""

import os
import stat

import _notices
import pytest

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
    """#1: 正当な https URL（&, %, #, ?, = を含む）は受理される。"""
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
        "https://example.com/あ",  # 非 ASCII
        "https://" + "a" * 2049,  # 長すぎる（2049字超）
    ],
)
def test_valid_url_rejects_malformed(url):
    """#2: 不正な URL（スキーム違反・空白・制御文字・禁止文字・非ASCII・長すぎ・ホスト空）は None。"""
    assert _notices._valid_url({"url": url}) is None


def test_valid_url_exactly_max_length_is_accepted():
    """#3: 境界値 - ちょうど 2048 字の https URL は受理される。"""
    url = "https://example.com/" + "a" * (2048 - len("https://example.com/"))
    assert len(url) == 2048
    assert _notices._valid_url({"url": url}) == url


@pytest.mark.parametrize("url", [123, ["https://example.com"], None])
def test_valid_url_rejects_non_string_types(url):
    """#4: url が int / list / None のいずれでも None を返す（例外にならない）。"""
    assert _notices._valid_url({"url": url}) is None


def test_valid_url_missing_key_returns_none():
    """#5: url キーが無い場合も None を返す。"""
    assert _notices._valid_url({}) is None


# ---- 不正な url を持つ項目の扱い ----


def test_invalid_url_item_still_shown_but_no_url_in_message():
    """#6: url が不正な項目も表示（title/body）には残るが、本文に URL 行は付かない。"""
    notices = [
        {"id": "n-1", "title": "件名", "body": "本文", "url": "javascript:alert(1)"}
    ]
    message = _notices._format_message(notices)
    assert "件名" in message
    assert "本文" in message
    assert "詳細:" not in message
    assert "javascript:" not in message


# ---- _format_message: 詳細: 行 ----


def test_format_message_appends_detail_line_when_body_present():
    """#7: 本文があれば、本文の後に改行して `詳細: <url>` を付ける。"""
    notices = [
        {"id": "n-1", "title": "件名", "body": "本文", "url": "https://example.com"}
    ]
    message = _notices._format_message(notices)
    assert message == "件名\n本文\n詳細: https://example.com"


def test_format_message_detail_line_alone_when_body_empty():
    """#8: 本文が空なら `詳細: <url>` だけが body 部分になる。"""
    notices = [{"id": "n-1", "title": "件名", "body": "", "url": "https://example.com"}]
    message = _notices._format_message(notices)
    assert message == "件名\n詳細: https://example.com"


def test_format_message_detail_line_without_title():
    """#9: title が無くても `詳細: <url>` は body の後に付く。"""
    notices = [{"id": "n-1", "body": "本文", "url": "https://example.com"}]
    message = _notices._format_message(notices)
    assert message == "本文\n詳細: https://example.com"


def test_format_message_no_detail_line_when_url_missing():
    """#10: url が無い項目には `詳細:` 行が付かない。"""
    notices = [{"id": "n-1", "title": "件名", "body": "本文"}]
    message = _notices._format_message(notices)
    assert "詳細:" not in message


# ---- first_url ----


def test_first_url_skips_invalid_and_returns_first_valid():
    """#11: 無効な url を持つ項目を飛ばし、先頭の有効な url を返す。"""
    unread = [
        {"id": "n-1", "body": "b1", "url": "javascript:alert(1)"},
        {"id": "n-2", "body": "b2", "url": "not a url"},
        {"id": "n-3", "body": "b3", "url": "https://example.com/first-valid"},
        {"id": "n-4", "body": "b4", "url": "https://example.com/second-valid"},
    ]
    assert _notices.first_url(unread) == "https://example.com/first-valid"


def test_first_url_returns_none_when_no_valid_url():
    """#12: 有効な url を持つ項目が無ければ None を返す。"""
    unread = [
        {"id": "n-1", "body": "b1"},
        {"id": "n-2", "body": "b2", "url": "javascript:alert(1)"},
    ]
    assert _notices.first_url(unread) is None


def test_first_url_empty_list_returns_none():
    """#13: 未読が空リストなら None を返す。"""
    assert _notices.first_url([]) is None


# ---- _write_seen ----


def test_write_seen_returns_true_on_success(tmp_path, monkeypatch):
    """#14: 状態ディレクトリへ書き込める場合、_write_seen は True を返す。"""
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "state"))
    assert _notices._write_seen({"n-1", "n-2"}) is True
    assert (tmp_path / "state" / "seen.json").exists()


def test_write_seen_returns_false_when_state_dir_path_is_a_file(tmp_path, monkeypatch):
    """#15: 状態ディレクトリの位置に既にファイルがあり mkdir できない場合、_write_seen は False を返す。"""
    blocker = tmp_path / "state-blocked"
    blocker.write_text("not a directory", encoding="utf-8")
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(blocker))
    assert _notices._write_seen({"n-1"}) is False


@pytest.mark.skipif(
    os.name == "nt", reason="chmod によるパーミッション制御は POSIX 限定"
)
def test_write_seen_returns_false_when_state_dir_readonly(tmp_path, monkeypatch):
    """#16: 状態ディレクトリが読み取り専用で書き込めない場合、_write_seen は False を返す。"""
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    state_dir.chmod(stat.S_IRUSR | stat.S_IXUSR)
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(state_dir))
    try:
        assert _notices._write_seen({"n-1"}) is False
    finally:
        state_dir.chmod(stat.S_IRWXU)
