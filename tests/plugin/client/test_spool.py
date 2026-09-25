"""ローカルキューの追記・退避・破棄を検証する。

`CLAUDE_PLUGIN_DATA` を一時ディレクトリに向けてテストを隔離する。
"""

import json
import os
import re
import time

import _spool
import pytest


@pytest.fixture(autouse=True)
def _isolate_state_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "plugin-data"))
    return tmp_path


def _read_lines(path):
    with open(path, encoding="utf-8") as f:
        return f.readlines()


# --- 追記 ---


def test_append_once_from_empty():
    _spool.append({"a": 1})
    path = _spool._queue_path()
    lines = _read_lines(path)
    assert len(lines) == 1
    assert lines[0].endswith("\n")
    assert json.loads(lines[0]) == {"a": 1}


def test_append_three_times_preserves_order():
    _spool.append({"n": 1})
    _spool.append({"n": 2})
    _spool.append({"n": 3})
    lines = _read_lines(_spool._queue_path())
    assert [json.loads(line)["n"] for line in lines] == [1, 2, 3]


def test_append_calls_write_once(monkeypatch):
    real_open = open
    calls = []

    class _CountingFile:
        def __init__(self, f):
            self._f = f

        def write(self, data):
            calls.append(data)
            return self._f.write(data)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            self._f.close()
            return False

    def fake_open(path, mode="r", encoding=None):
        return _CountingFile(real_open(path, mode, encoding=encoding))

    monkeypatch.setattr(_spool, "open", fake_open, raising=False)
    _spool.append({"a": 1})
    assert len(calls) == 1


def test_append_value_with_newline_stays_one_line():
    _spool.append({"text": "line1\nline2"})
    lines = _read_lines(_spool._queue_path())
    assert len(lines) == 1
    assert json.loads(lines[0])["text"] == "line1\nline2"


def test_append_non_ascii_round_trips():
    original = "日本語のテスト値-秘密ではない"
    _spool.append({"text": original})
    lines = _read_lines(_spool._queue_path())
    assert json.loads(lines[0])["text"] == original


def test_append_creates_missing_parent_dir():
    path = _spool._queue_path()
    assert not path.parent.exists()
    _spool.append({"a": 1})
    assert path.exists()


# --- 退避 ---


def test_rotate_moves_three_lines():
    rows = [{"n": 1}, {"n": 2}, {"n": 3}]
    for row in rows:
        _spool.append(row)
    queue_path = _spool._queue_path()

    _spool.rotate()

    assert not queue_path.exists()
    spool_files = list(_spool._spool_dir().iterdir())
    assert len(spool_files) == 1
    lines = _read_lines(spool_files[0])
    assert len(lines) == 3
    assert [json.loads(line) for line in lines] == rows


def test_rotate_filename_pattern():
    _spool.append({"a": 1})
    _spool.rotate()
    spool_files = list(_spool._spool_dir().iterdir())
    assert len(spool_files) == 1
    assert re.fullmatch(r"\d{10,}-[0-9a-f]{32}\.jsonl", spool_files[0].name)


def test_rotate_twice_with_fixed_time_keeps_two_files(monkeypatch):
    """時刻を固定したまま退避を 2 回（間に queue.jsonl を作り直す） -> spool/ に 2 ファイル。
    合計行数が保存される。"""
    monkeypatch.setattr(_spool.time, "time", lambda: 1_700_000_000)

    _spool.append({"n": 1})
    _spool.append({"n": 2})
    _spool.rotate()

    _spool.append({"n": 3})
    _spool.rotate()

    spool_files = list(_spool._spool_dir().iterdir())
    assert len(spool_files) == 2
    total_lines = sum(len(_read_lines(p)) for p in spool_files)
    assert total_lines == 3


def test_rotate_missing_queue_file_is_noop():
    assert not _spool._queue_path().exists()
    _spool.rotate()
    assert not _spool._spool_dir().exists() or list(_spool._spool_dir().iterdir()) == []


def test_rotate_empty_queue_file_is_noop():
    path = _spool._queue_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()
    assert path.stat().st_size == 0

    _spool.rotate()

    assert path.exists()
    assert not _spool._spool_dir().exists() or list(_spool._spool_dir().iterdir()) == []


# --- 送信条件 ---


def _touch_sent_at_seconds_ago(seconds_ago):
    path = _spool._sent_at_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()
    mtime = time.time() - seconds_ago
    os.utime(path, (mtime, mtime))


def test_should_send_false_within_threshold():
    _spool.append({"a": 1})
    _touch_sent_at_seconds_ago(9 * 60 + 59)
    assert _spool.should_send() is False


def test_should_send_true_past_threshold():
    _spool.append({"a": 1})
    _touch_sent_at_seconds_ago(10 * 60 + 1)
    assert _spool.should_send() is True


def test_should_send_true_when_sent_at_in_future():
    """sent_at が 1 時間後（時計のズレ・手動改変） -> 真（経過が負でも送信を止めない）。"""
    _spool.append({"a": 1})
    _touch_sent_at_seconds_ago(-3600)
    assert _spool.should_send() is True


def test_should_send_true_when_sent_at_missing():
    _spool.append({"a": 1})
    assert not _spool._sent_at_path().exists()
    assert _spool.should_send() is True


def test_should_send_false_when_queue_missing():
    assert not _spool._queue_path().exists()
    assert _spool.should_send() is False


def test_mark_sent_updates_mtime_to_now():
    _spool.mark_sent()
    path = _spool._sent_at_path()
    assert path.exists()
    assert abs(time.time() - path.stat().st_mtime) < 5


# --- 破棄 ---


def test_prune_under_limits_deletes_nothing(seed_spool_bytes):
    spool_dir = _spool._spool_dir()
    now = time.time()
    one_day_ago = now - 86400
    total = int(4.9 * 1024 * 1024)
    per_file = total // 5
    for i in range(5):
        seed_spool_bytes(f"{1000 + i}-{'a' * 32}.jsonl", per_file, one_day_ago)

    _spool.prune()

    assert len(list(spool_dir.iterdir())) == 5


def test_prune_over_size_deletes_oldest_first(seed_spool_bytes):
    """1MB x 6 件（mtime が 1 分ずつ古い） -> 合計 5MB 以下になるまで古い順に削除。
    残るのは新しい 5 件。"""
    spool_dir = _spool._spool_dir()
    now = time.time()
    one_mb = 1024 * 1024
    names = []
    for i in range(6):
        mtime = now - i * 60
        name = f"{2000 + i}-{'b' * 32}.jsonl"
        names.append((name, mtime))
        seed_spool_bytes(name, one_mb, mtime)

    _spool.prune()

    remaining = {p.name for p in spool_dir.iterdir()}
    oldest_name = names[5][0]  # i=5 -> now - 300 -> 最も古い
    assert oldest_name not in remaining
    assert len(remaining) == 5
    total_size = sum(p.stat().st_size for p in spool_dir.iterdir())
    assert total_size <= 5 * 1024 * 1024


def test_prune_deletes_file_older_than_max_days(seed_spool_bytes):
    spool_dir = _spool._spool_dir()
    mtime = time.time() - (7 * 86400 + 1)
    seed_spool_bytes(f"{3000}-{'c' * 32}.jsonl", 1024, mtime)

    _spool.prune()

    assert list(spool_dir.iterdir()) == []


def test_prune_keeps_file_within_max_days(seed_spool_bytes):
    mtime = time.time() - 6 * 86400
    path = seed_spool_bytes(f"{4000}-{'d' * 32}.jsonl", 1024, mtime)

    _spool.prune()

    assert path.exists()


def test_prune_missing_spool_dir_is_noop():
    assert not _spool._spool_dir().exists()
    _spool.prune()


def test_prune_ignores_non_jsonl_files():
    spool_dir = _spool._spool_dir()
    spool_dir.mkdir(parents=True, exist_ok=True)
    other = spool_dir / "note.txt"
    other.write_bytes(b"x" * (10 * 1024 * 1024))
    old_mtime = time.time() - 30 * 86400
    os.utime(other, (old_mtime, old_mtime))

    _spool.prune()

    assert other.exists()
