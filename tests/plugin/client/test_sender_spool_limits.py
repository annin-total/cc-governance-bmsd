"""spool の保持日数の境界・送信先の変更・error 行の集約の順序を検証する。

POST は `_sender._post_body` を差し替えて記録する。`config.json` は一時ファイルに書く。
"""

import json
import os

import _sender
import _spool
import pytest

_NOW = 1_700_000_000
_DAY = 86400


@pytest.fixture(autouse=True)
def _isolate_state_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "plugin-data"))


def _write_config(monkeypatch, tmp_path, **overrides):
    config = {
        "ingest_url": "",
        "ingest_token": "",
        "timeout_sec": 5,
        "spool_max_bytes": 5242880,
        "spool_max_days": 7,
        **overrides,
    }
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setattr(_sender, "_CONFIG_PATH", path)


def _seed(name, size, mtime):
    spool_dir = _spool._spool_dir()
    spool_dir.mkdir(parents=True, exist_ok=True)
    path = spool_dir / name
    path.write_bytes(b"x" * size)
    os.utime(path, (mtime, mtime))
    return path


def _record_posts(monkeypatch, statuses):
    """POST を (送信先, 本文) で記録し、`statuses` を順に返す（尽きたら最後の値）。"""
    posts = []

    def _fake(body, config):
        posts.append((config["ingest_url"], body))
        return statuses[min(len(posts), len(statuses)) - 1]

    monkeypatch.setattr(_sender, "_post_body", _fake)
    return posts


def _queued_error_types():
    path = _spool._queue_path()
    if not path.exists():
        return []
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    return [r["error_type"] for r in rows if r.get("kind") == "error"]


# --- spool_max_days の境界と config.json の値 ---


@pytest.mark.parametrize(("age_sec", "kept"), [(3 * _DAY, True), (3 * _DAY + 1, False)])
def test_prune_keeps_file_exactly_max_days_old(monkeypatch, age_sec, kept):
    """経過がちょうど保持日数なら残し、1 秒でも超えれば消す。"""
    monkeypatch.setattr(_spool.time, "time", lambda: float(_NOW))
    path = _seed(f"1000-{'a' * 32}.jsonl", 10, _NOW - age_sec)

    _spool.prune(max_bytes=5242880, max_days=3)

    assert path.exists() is kept


def test_run_prunes_with_spool_max_days_from_config(monkeypatch, tmp_path):
    """`config.json` の保持日数で消す（既定の日数では残る古さのファイル）。"""
    _write_config(monkeypatch, tmp_path, spool_max_days=3)
    path = _seed(f"1000-{'a' * 32}.jsonl", 10, _spool.time.time() - 5 * _DAY)
    assert _spool.DEFAULT_SPOOL_MAX_DAYS > 5

    _sender.run()

    assert not path.exists()


# --- 送信先の変更 ---


def test_backlog_goes_to_new_destination(monkeypatch, tmp_path):
    """旧送信先で積み残した分は、送信先を変えた次の回に新しい送信先へ届いて消える。"""
    old_url, new_url = "http://old.invalid/ingest", "http://new.invalid/ingest"
    old_posts = _record_posts(monkeypatch, [413])
    _write_config(monkeypatch, tmp_path, ingest_url=old_url)
    _spool.append({"kind": "event", "n": 1})
    _sender.run()
    assert [url for url, _ in old_posts] == [old_url]

    new_posts = _record_posts(monkeypatch, [200])
    _write_config(monkeypatch, tmp_path, ingest_url=new_url)
    _sender.run()

    assert {url for url, _ in new_posts} == {new_url}
    assert old_posts[0][1] in [body for _, body in new_posts]
    assert list(_spool._spool_dir().glob("*.jsonl")) == []


# --- error 行の集約 ---


def test_mixed_failure_statuses_are_one_row_each_in_first_seen_order(
    monkeypatch, tmp_path
):
    """1 回の送信で状態コードが混ざっても、状態コードごとに 1 行を初出の順に積む。"""
    _record_posts(monkeypatch, [413, 400, 413, 200, 400])
    _write_config(monkeypatch, tmp_path, ingest_url="http://x.invalid/ingest")
    for i in range(5):
        _seed(f"{1000 + i}-{'a' * 32}.jsonl", 10, _NOW + i)

    _sender.run()

    assert _queued_error_types() == ["HTTP 413", "HTTP 400"]
