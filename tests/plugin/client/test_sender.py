"""送信プロセス（`_sender.py`）を検証する。POST の検査はテスト内に立てた HTTP サーバで行う。

`CLAUDE_PLUGIN_DATA` を一時ディレクトリに向けてテストを隔離する。
`_sender._CONFIG_PATH` を一時ファイルに向けて `config.json` の実体から切り離す。
"""

import http.server
import json
import os
import threading
import time
from typing import ClassVar

import _sender
import _spool
import pytest

_SPOOL_NAME = f"{1000}-{'a' * 32}.jsonl"


@pytest.fixture(autouse=True)
def _isolate_state_dir(monkeypatch, tmp_path):
    """CLAUDE_PLUGIN_DATA を一時ディレクトリに向ける。"""
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


def test_post_success_deletes_file(server, monkeypatch, tmp_path):
    """#1: spool に 1 ファイル、サーバが 200 -> ファイルが削除される。"""
    srv = server()
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert not path.exists()


def test_post_body_matches_spool_bytes(server, monkeypatch, tmp_path):
    """#2: サーバが受け取ったボディが spool の内容とバイト単位で一致する。"""
    srv = server()
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}, {"n": 2}])
    expected = path.read_bytes()

    _sender.run()

    assert srv.requests[0]["body"] == expected


def test_post_content_type_header(server, monkeypatch, tmp_path):
    """#3: Content-Type が application/x-ndjson。"""
    srv = server()
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert srv.requests[0]["content_type"] == "application/x-ndjson"


def test_post_token_header_matches_config(server, monkeypatch, tmp_path):
    """#4: X-Ingest-Token が config.json の値と一致する。"""
    srv = server()
    _write_config(
        monkeypatch, tmp_path, ingest_url=srv.url, ingest_token="secret-token"
    )
    _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert srv.requests[0]["token"] == "secret-token"


def test_201_is_treated_as_success(server, monkeypatch, tmp_path):
    """#5: サーバが 201 -> ファイルが削除される（2xx はすべて成功）。"""
    srv = server(status_codes=[201])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert not path.exists()


@pytest.mark.parametrize("status", [401, 500, 404])
def test_non_2xx_keeps_file(server, monkeypatch, tmp_path, status):
    """#6-#8: サーバが 401 / 500 / 404 -> ファイルが残る。"""
    srv = server(status_codes=[status])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert path.exists()


# --- 到達できない・応答しないサーバ ---


def test_connection_refused_is_silent(monkeypatch, tmp_path, unused_port):
    """#9: 接続できないポート -> 例外なし。ファイルが残る。終了コード 0（例外が上がらない）。"""
    port = unused_port()
    _write_config(monkeypatch, tmp_path, ingest_url=f"http://127.0.0.1:{port}/ingest")
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert path.exists()


def test_unresponsive_server_respects_timeout(server, monkeypatch, tmp_path):
    """#10: 応答しないサーバ、timeout_sec=1 -> 例外なし。ファイルが残る。実行時間が 5 秒未満。"""
    srv = server(status_codes=[200], delay_sec=2)
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url, timeout_sec=1)
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    started = time.monotonic()
    _sender.run()
    elapsed = time.monotonic() - started

    assert path.exists()
    assert elapsed < 5


# --- 複数ファイルの処理順序・部分失敗 ---


def test_multiple_files_posted_in_epoch_order(server, monkeypatch, tmp_path):
    """#11: spool に 3 ファイル、サーバが 200 -> ファイル名の epoch 昇順に POST される。"""
    srv = server(status_codes=[200, 200, 200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    _seed_spool_file(f"{3000}-{'c' * 32}.jsonl", [{"n": 3}])
    _seed_spool_file(_SPOOL_NAME, [{"n": 1}])
    _seed_spool_file(f"{2000}-{'b' * 32}.jsonl", [{"n": 2}])

    _sender.run()

    order = [json.loads(r["body"].splitlines()[0])["n"] for r in srv.requests]
    assert order == [1, 2, 3]


def test_middle_file_failure_keeps_only_that_file(server, monkeypatch, tmp_path):
    """#12: spool に 3 ファイル、2 番目だけ 500 -> 1・3 番目は削除、2 番目は残る。"""
    srv = server(status_codes=[200, 500, 200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    p1 = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])
    p2 = _seed_spool_file(f"{2000}-{'b' * 32}.jsonl", [{"n": 2}])
    p3 = _seed_spool_file(f"{3000}-{'c' * 32}.jsonl", [{"n": 3}])

    _sender.run()

    assert not p1.exists()
    assert p2.exists()
    assert not p3.exists()


# --- queue.jsonl の退避との連携 ---


def test_queue_is_rotated_before_posting(server, monkeypatch, tmp_path):
    """#13: 実行前に queue.jsonl が 2 行ある -> 退避されてから POST される。POST 後に queue.jsonl が無い。"""
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
    """#14: spool が空、queue.jsonl も無い -> POST を行わない。終了コード 0。"""
    srv = server(status_codes=[200])
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)

    _sender.run()

    assert srv.requests == []


def test_prune_runs_after_posting(server, monkeypatch, tmp_path, seed_spool_bytes):
    """#15: spool 合計が 6MB（1MB x 6）、サーバが 500 -> 6 ファイルとも POST され、その後に古い 1 ファイルが破棄される。"""
    srv = server(status_codes=[500] * 6)
    _write_config(monkeypatch, tmp_path, ingest_url=srv.url)
    now = time.time()
    one_mb = 1024 * 1024
    paths = [
        seed_spool_bytes(f"{4000 + i}-{'d' * 32}.jsonl", one_mb, now - i * 60)
        for i in range(6)
    ]

    _sender.run()

    assert len(srv.requests) == 6
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
    """#16: ingest_url が空文字 -> POST を行わない。終了コード 0。spool は残る。"""
    srv = server(status_codes=[200])
    _write_config(monkeypatch, tmp_path, ingest_url="")
    path = _seed_spool_file(_SPOOL_NAME, [{"n": 1}])

    _sender.run()

    assert srv.requests == []
    assert path.exists()


def test_missing_config_file_is_silent(monkeypatch, tmp_path):
    """#17: config.json が無い -> 例外なし。終了コード 0。"""
    monkeypatch.setattr(_sender, "_CONFIG_PATH", tmp_path / "no-such-config.json")

    _sender.run()


def test_corrupt_config_file_is_silent(monkeypatch, tmp_path):
    """#18: config.json が壊れた JSON -> 例外なし。終了コード 0。"""
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
    """#19: 起動関数を呼ぶ -> Popen に start_new_session=True と 3 つの DEVNULL が渡る。"""
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
    """#20: 3 秒かかる子プロセスに対して起動関数を呼ぶ -> 起動関数の戻りが 1 秒未満（待たない）。"""
    import subprocess

    monkeypatch.setattr(subprocess, "Popen", _FakePopen)

    started = time.monotonic()
    _sender.launch()
    elapsed = time.monotonic() - started

    assert elapsed < 1
