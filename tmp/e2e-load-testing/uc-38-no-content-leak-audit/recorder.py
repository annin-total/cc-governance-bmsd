"""送信の生バイトを記録して DockerServer へ中継する前段（127.0.0.1・デーモンスレッド）。

ingest_url は `http://127.0.0.1:<port>/<シナリオ名><BASE_PATH>/ingest` にする。先頭 1 段を剥がして中継する。
`fail_first` に入れたシナリオは、最初の POST にだけ 500 を返す（送信側の error 行を実物の経路で起こす）。
"""

import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class Recorder:
    def __init__(self, upstream_port: int, fail_first: set) -> None:
        self.posts: list = []  # (シナリオ名, 要求行, ヘッダ（トークン除く）, 本文 bytes, 返した status)
        self._lock = threading.Lock()
        self._failed: set = set()
        handler = _make_handler(self, upstream_port, set(fail_first))
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def url(self, scenario: str, path: str) -> str:
        return f"http://127.0.0.1:{self.port}/{scenario}{path}"

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)


def _make_handler(rec: Recorder, upstream_port: int, fail_first: set) -> type:
    class _Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            scenario, _, rest = self.path.lstrip("/").partition("/")
            headers = {k: v for k, v in self.headers.items() if k.lower() != "x-ingest-token"}
            with rec._lock:
                inject = scenario in fail_first and scenario not in rec._failed
                rec._failed.add(scenario)
            if inject:
                status, payload = 500, b"injected"
            else:
                status, payload = _forward(upstream_port, "/" + rest, body, self.headers)
            with rec._lock:
                rec.posts.append((scenario, f"POST {self.path}", headers, body, status))
            self.send_response(status)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args) -> None:
            pass

    return _Handler


def _forward(port: int, path: str, body: bytes, headers) -> tuple:
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}", data=body, method="POST",
        headers={k: headers[k] for k in ("Content-Type", "X-Ingest-Token") if headers.get(k)},
    )  # fmt: skip
    try:
        with _OPENER.open(req, timeout=30) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
