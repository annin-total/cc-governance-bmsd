"""サーバの手前の中継。サーバには必ず届け、端末への応答だけを捨てる（drop）か遅らせる（hang）。"""

import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class Proxy:
    """`mode` は "pass" / "drop" / "hang"。`faults` 回だけ故障を起こし、以後は素通しする。"""

    def __init__(self, upstream_port: int) -> None:
        self.upstream = upstream_port
        self.mode, self.faults, self.hang_sec = "pass", 0, 0.0
        self.log: list = []
        proxy = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a) -> None:
                pass

            def do_POST(self) -> None:
                body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                req = urllib.request.Request(
                    f"http://127.0.0.1:{proxy.upstream}{self.path}", data=body, method="POST",
                    headers={k: v for k, v in self.headers.items() if k.lower() != "host"},
                )  # fmt: skip
                try:
                    with _OPENER.open(req, timeout=30) as r:
                        status, out = r.status, r.read()
                except urllib.error.HTTPError as e:
                    status, out = e.code, e.read()
                fault = proxy.mode if proxy.faults > 0 else "pass"
                if fault != "pass":
                    proxy.faults -= 1
                proxy.log.append((time.time(), status, fault, out[:80]))
                if fault == "drop":
                    self.close_connection = True
                    return  # 応答を書かずに切る（サーバは書き込み済み）
                if fault == "hang":
                    time.sleep(proxy.hang_sec)
                self.send_response(status)
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.srv.shutdown()
        self.srv.server_close()
