"""送信プロセス（`_sender.py`）を検証する。POST の検査はテスト内に立てた HTTP サーバで行う。

`CLAUDE_PLUGIN_DATA` を一時ディレクトリに向けてテストを隔離する。
`_sender._CONFIG_PATH` を一時ファイルに向けて `config.json` の実体から切り離す。
"""

import http.server
import json
import os
import socket
import threading
import time
from typing import ClassVar

import _sender
import _spool
import pytest

_SPOOL_NAME = f"{1000}-{'a' * 32}.jsonl"


@pytest.fixture(autouse=True)
def _isolate_state_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_PLUGIN_DATA", str(tmp_path / "plugin-data"))
    return tmp_path


# --- テスト用 HTTP サーバ ---


class _CaptureHandler(http.server.BaseHTTPRequestHandler):
    """POST を受け取り、本文・ヘッダを記録して既定の応答コードを返すハンドラ。"""

    status_codes: ClassVar[list] = [200]
    delay_sec = 0
    requests: ClassVar[list] = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        if self.__class__.delay_sec:
            time.sleep(self.__class__.delay_sec)
        index = len(self.__class__.requests)
        self.__class__.requests.append(
            {
                "body": body,
                "content_type": self.headers.get("Content-Type"),
                "token": self.headers.get("X-Ingest-Token"),
            }
        )
        codes = self.__class__.status_codes
        code = codes[index] if index < len(codes) else codes[-1]
        self.send_response(code)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


class _TestServer:
    """1 テストごとに使い捨てる HTTP サーバ。"""

    def __init__(self, status_codes=(200,), delay_sec=0):
        self.requests = []
        handler = type(
            "_Handler",
            (_CaptureHandler,),
            {
                "status_codes": list(status_codes),
                "delay_sec": delay_sec,
                "requests": self.requests,
            },
        )
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.httpd.server_port}/ingest"

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture
def server():
    """既定 200 を返すサーバ。`status_codes=` / `delay_sec=` で個別に立て直せる。"""
    instances = []

    def _make(status_codes=(200,), delay_sec=0):
        srv = _TestServer(status_codes=status_codes, delay_sec=delay_sec)
        instances.append(srv)
        return srv

    yield _make
    for srv in instances:
        srv.close()


def _write_config(monkeypatch, tmp_path, **overrides):
    """config.json を一時ファイルに書き、`_sender._CONFIG_PATH` をそこへ向ける。"""
    config = {
        "ingest_url": "",
        "ingest_token": "",
        "timeout_sec": 60,
        "spool_max_bytes": 5242880,
        "spool_max_days": 7,
    }
    config.update(overrides)
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    monkeypatch.setattr(_sender, "_CONFIG_PATH", path)
    return path


def _error_rows():
    """`queue.jsonl` の error 行を (stage, error_type, hook_event) の並びで返す。"""
    path = _spool._queue_path()
    if not path.exists():
        return []
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    return [
        (r["stage"], r["error_type"], r["hook_event"])
        for r in rows
        if r.get("kind") == "error"
    ]


def _all_error_rows():
    """spool と `queue.jsonl` の error 行を合わせて (stage, error_type, hook_event) の並びで返す。"""
    paths = [*_spool._spool_dir().glob("*.jsonl"), _spool._queue_path()]
    rows = [
        json.loads(line)
        for path in paths
        if path.exists()
        for line in path.read_text(encoding="utf-8").splitlines()
    ]
    return [
        (r["stage"], r["error_type"], r["hook_event"])
        for r in rows
        if r.get("kind") == "error"
    ]


def _seed_spool_file(name, rows, mtime=None):
    """spool/ に、渡した行から作った `.jsonl` ファイルを 1 つ置く。"""
    spool_dir = _spool._spool_dir()
    spool_dir.mkdir(parents=True, exist_ok=True)
    path = spool_dir / name
    text = "".join(json.dumps(row) + "\n" for row in rows)
    path.write_text(text, encoding="utf-8")
    if mtime is not None:
        os.utime(path, (mtime, mtime))
    return path


# --- POST の基本動作 ---


@pytest.mark.parametrize("status", [200, 201])
def test_2xx_deletes_file(server, monkeypatch, tmp_path, status):
    """サーバが 200 / 201 -> ファイルが削除される（2xx はすべて成功）。"""
    srv = server(status_codes=[status])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert not path.exists()
    assert _error_rows() == []


_HEADER_CASES = {
    # (config.json に足す値, 記録したヘッダ, 期待値)
    "content_type": ({}, "content_type", "application/x-ndjson"),
    "token": ({"ingest_token": "secret-token"}, "token", "secret-token"),
}


@pytest.mark.parametrize(
    ("overrides", "header", "expected"),
    _HEADER_CASES.values(),
    ids=_HEADER_CASES.keys(),
)
def test_post_header(server, monkeypatch, tmp_path, overrides, header, expected):
    srv = server()
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url, **overrides)
    _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert srv.requests[0][header] == expected


def test_post_body_matches_spool_bytes(server, monkeypatch, tmp_path):
    srv = server()
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}, {"n": 2}])
    expected = path.read_bytes()

    _sender.run()

    assert srv.requests[0]["body"] == expected


@pytest.mark.parametrize("status", [401, 500, 404])
def test_non_2xx_keeps_file(server, monkeypatch, tmp_path, status):
    srv = server(status_codes=[status])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert path.exists()
    assert _error_rows() == [("send", f"HTTP {status}", None)]


def test_ssl_error_queues_error_row(server, monkeypatch, tmp_path):
    """平文の HTTP サーバへ https で繋ぐ（TLS のハンドシェイクが失敗する）。"""
    srv = server()
    url = srv.url.replace("http://", "https://")
    _write_config(monkeypatch, tmp_path, ingest_url=url, timeout_sec=5)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert path.exists()
    assert _error_rows() == [("send", "SSLError", None)]


def test_run_failure_queues_error_row(monkeypatch, tmp_path):
    class _InjectedError(Exception):
        pass

    def _raiser():
        raise _InjectedError("ZZMARKER")

    _write_config(monkeypatch, tmp_path, ingest_url="")
    monkeypatch.setattr(_spool, "rotate", _raiser)

    _sender.run()

    assert _error_rows() == [("send", "_InjectedError", None)]
    assert "ZZMARKER" not in _spool._queue_path().read_text(encoding="utf-8")


# --- 到達できない・応答しないサーバ ---


def test_connection_refused_is_silent(monkeypatch, tmp_path, unused_port):
    port = unused_port()
    _write_config(monkeypatch, tmp_path, ingest_url=f"http://127.0.0.1:{port}/ingest")
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert path.exists()
    assert _error_rows() == []


def test_unresponsive_server_stops_after_first_file(server, monkeypatch, tmp_path):
    """応答しないサーバには 1 ファイルで見切りを付け、ファイル数 × timeout 粘らない。"""
    srv = server(status_codes=[200], delay_sec=3)
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url, timeout_sec=1)
    paths = [
        _seed_spool_file(f"{1000 + i}-{'a' * 32}.jsonl", [{"n": i}]) for i in range(3)
    ]

    started = time.monotonic()
    _sender.run()
    elapsed = time.monotonic() - started

    assert all(p.exists() for p in paths)
    assert elapsed < 2
    assert _error_rows() == []


def test_unreachable_server_still_prunes(monkeypatch, tmp_path, unused_port):
    port = unused_port()
    _write_config(monkeypatch, tmp_path, ingest_url=f"http://127.0.0.1:{port}/ingest")
    old = _seed_spool_file(_SPOOL_NAME, [{"n": 1}], mtime=time.time() - 30 * 86400)

    _sender.run()

    assert not old.exists()


class _GarbageServer:
    """HTTP でない応答を返して切るサーバ。受け付けた接続を数える。"""

    def __init__(self):
        self.connections = 0
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen()
        threading.Thread(target=self._serve, daemon=True).start()

    def _serve(self):
        while True:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            self.connections += 1
            with conn:
                conn.recv(65536)
                conn.sendall(b"garbage\r\n\r\n")

    @property
    def url(self):
        return f"http://127.0.0.1:{self.sock.getsockname()[1]}/ingest"


def test_malformed_response_stops_and_still_prunes(monkeypatch, tmp_path):
    srv = _GarbageServer()
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url, timeout_sec=5)
    old = _seed_spool_file(_SPOOL_NAME, [{"n": 0}], mtime=time.time() - 30 * 86400)
    fresh = [
        _seed_spool_file(f"{2000 + i}-{'b' * 32}.jsonl", [{"n": i}]) for i in range(2)
    ]

    try:
        _sender.run()
    finally:
        srv.sock.close()

    assert srv.connections == 1
    assert not old.exists()
    assert all(p.exists() for p in fresh)


# --- 複数ファイルの処理順序・部分失敗 ---


def test_multiple_files_posted_in_epoch_order(server, monkeypatch, tmp_path):
    srv = server(status_codes=[200, 200, 200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    _seed_spool_file(f"{3000}-{'c' * 32}.jsonl", [{"n": 3}])
    _seed_spool_file(_SPOOL_NAME, [{"n": 1}])
    _seed_spool_file(f"{2000}-{'b' * 32}.jsonl", [{"n": 2}])

    _sender.run()

    order = [json.loads(r["body"].splitlines()[0])["n"] for r in srv.requests]
    assert order == [1, 2, 3]


def test_middle_file_failure_keeps_only_that_file(server, monkeypatch, tmp_path):
    srv = server(status_codes=[200, 500, 200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    p1 = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])
    p2 = _seed_spool_file(f"{2000}-{'b' * 32}.jsonl", [{"n": 2}])
    p3 = _seed_spool_file(f"{3000}-{'c' * 32}.jsonl", [{"n": 3}])

    _sender.run()

    assert not p1.exists()
    assert p2.exists()
    assert not p3.exists()


def test_error_rows_are_one_per_status_per_run(server, monkeypatch, tmp_path):
    """全ファイルが 413 のまま k 回送る -> error 行は k 行（ファイル数ぶん積まない）。"""
    runs = 3
    srv = server(status_codes=[413])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    for i in range(3):
        _seed_spool_file(f"{1000 + i}-{'a' * 32}.jsonl", [{"n": i}])

    for _ in range(runs):
        _sender.run()

    assert _all_error_rows() == [("send", "HTTP 413", None)] * runs


@pytest.mark.parametrize("status", [400, 413])
def test_poison_file_does_not_block_later_files(server, monkeypatch, tmp_path, status):
    """1 ファイルだけが 4xx（打ち切らない状態コード） -> 後続のファイルは届いて消える。"""
    srv = server(status_codes=[status, 200, 200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    poison = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])
    later = [
        _seed_spool_file(f"{2000 + i}-{'b' * 32}.jsonl", [{"n": i}]) for i in range(2)
    ]

    _sender.run()

    assert poison.exists()
    assert not any(p.exists() for p in later)
    assert _error_rows() == [("send", f"HTTP {status}", None)]


@pytest.mark.parametrize(
    ("status", "expected_posts"),
    [(500, _sender._MAX_CONSECUTIVE_5XX), (401, 1), (403, 1), (404, 1)],
)
def test_run_halts_on_failure_status(
    server, monkeypatch, tmp_path, status, expected_posts
):
    """全件が 5xx なら連続上限で、401・403・404 なら 1 本目で打ち切り、ファイルは残す。"""
    srv = server(status_codes=[status])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    paths = [
        _seed_spool_file(f"{1000 + i}-{'a' * 32}.jsonl", [{"n": i}]) for i in range(5)
    ]

    _sender.run()

    assert len(srv.requests) == expected_posts
    assert all(p.exists() for p in paths)
    assert _error_rows() == [("send", f"HTTP {status}", None)]


# --- queue.jsonl の退避との連携 ---


def test_queue_is_rotated_before_posting(server, monkeypatch, tmp_path):
    srv = server(status_codes=[200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    _spool.append({"n": 1})
    _spool.append({"n": 2})
    queue_path = _spool._queue_path()

    _sender.run()

    assert not queue_path.exists()
    assert len(srv.requests) == 1
    lines = srv.requests[0]["body"].splitlines()
    assert len(lines) == 2


def test_nothing_to_send_does_not_post(server, monkeypatch, tmp_path):
    srv = server(status_codes=[200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)

    _sender.run()

    assert srv.requests == []


def test_prune_runs_after_posting(server, monkeypatch, tmp_path, seed_spool_bytes):
    """spool 合計が 6MB（1MB x 6）、サーバが 500 -> 打ち切った後に古い 1 ファイルが破棄される。"""
    srv = server(status_codes=[500] * 6)
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    now = time.time()
    one_mb = 1024 * 1024
    paths = [
        seed_spool_bytes(f"{4000 + i}-{'d' * 32}.jsonl", one_mb, now - i * 60)
        for i in range(6)
    ]

    _sender.run()

    assert len(srv.requests) == _sender._MAX_CONSECUTIVE_5XX
    assert [p.exists() for p in paths] == [True] * 5 + [False]


@pytest.mark.parametrize("status", [200, 500])
def test_oversized_queue_is_posted_once_before_prune(
    server, monkeypatch, tmp_path, status
):
    """単体で spool_max_bytes を超える queue -> 1 回 POST される。成否にかかわらず spool には残らない。"""
    srv = server(status_codes=[status])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url, spool_max_bytes=10)
    _spool.append({"n": 1, "pad": "x" * 100})

    _sender.run()

    assert len(srv.requests) == 1
    assert list(_spool._spool_dir().glob("*.jsonl")) == []


# --- ingest_url が空、config.json が無い・壊れている ---


def test_empty_ingest_url_skips_posting(server, monkeypatch, tmp_path):
    srv = server(status_codes=[200])
    _write_config(monkeypatch, tmp_path, ingest_url="")
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert srv.requests == []
    assert path.exists()


def test_empty_ingest_url_still_rotates_and_prunes(monkeypatch, tmp_path):
    """送信先が空でも queue.jsonl を退避し、spool の上限を効かせる。"""
    _write_config(monkeypatch, tmp_path, ingest_url="")
    _spool.append({"n": 1})
    old = _seed_spool_file(_SPOOL_NAME, [{"n": 0}], mtime=time.time() - 30 * 86400)

    _sender.run()

    assert not _spool._queue_path().exists()
    assert not old.exists()


def test_missing_config_file_is_silent(monkeypatch, tmp_path):
    monkeypatch.setattr(_sender, "_CONFIG_PATH", tmp_path / "no-such-config.json")
    _spool.append({"n": 1})

    _sender.run()

    assert _spool._queue_path().exists()


def test_corrupt_config_file_is_silent(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    path.write_text("{not valid json", encoding="utf-8")
    monkeypatch.setattr(_sender, "_CONFIG_PATH", path)

    _sender.run()


# --- 起動関数 ---


class _FakePopen:
    """subprocess.Popen の偽物。呼び出し引数を記録し、`wait()` は明示的に呼ばれるまで戻らない。"""

    def __init__(self, args, **kwargs):
        self.args = args
        self.kwargs = kwargs

    def wait(self):
        time.sleep(3)


def test_launch_uses_detach_flags(monkeypatch):
    import subprocess

    calls = []

    def fake_popen(args, **kwargs):
        calls.append((args, kwargs))
        return _FakePopen(args, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    _sender.launch()

    assert len(calls) == 1
    _, kwargs = calls[0]
    assert kwargs["start_new_session"] is True
    assert kwargs["stdin"] is subprocess.DEVNULL
    assert kwargs["stdout"] is subprocess.DEVNULL
    assert kwargs["stderr"] is subprocess.DEVNULL


def test_launch_does_not_wait_for_child(monkeypatch):
    import subprocess

    monkeypatch.setattr(subprocess, "Popen", _FakePopen)

    started = time.monotonic()
    _sender.launch()
    elapsed = time.monotonic() - started

    assert elapsed < 1
