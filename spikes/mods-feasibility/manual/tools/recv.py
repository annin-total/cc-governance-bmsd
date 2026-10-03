"""検証用の受信器。127.0.0.1 だけで待ち受け、受けた要求の形（本文は長さと sha256 だけ）を 1 行ずつ出す。

使い方: python recv.py [--port 18850] [--seconds 600] [--log recv.jsonl]
Ctrl+C か --seconds の経過で止まる。本文・認証ヘッダの値は記録しない。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
DEFAULT_PORT = 18850
DEFAULT_SECONDS = 600
SHOWN_HEADERS = ("content-type", "user-agent", "content-length")


class _Handler(BaseHTTPRequestHandler):
    log_path: Path | None = None

    def _handle(self) -> None:
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length) if length else b""
        row = {
            "at": round(time.time(), 3),
            "method": self.command,
            "path": self.path,
            "bodyLen": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
            "headers": {
                k: self.headers.get(k) for k in SHOWN_HEADERS if self.headers.get(k)
            },
            "otherHeaderNames": sorted(
                k.lower() for k in self.headers if k.lower() not in SHOWN_HEADERS
            ),
        }
        line = json.dumps(row, ensure_ascii=False)
        print(line, flush=True)
        if self.log_path:
            with self.log_path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        payload = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_GET = do_POST = do_PUT = _handle

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--seconds", type=int, default=DEFAULT_SECONDS)
    ap.add_argument("--log", type=Path)
    a = ap.parse_args()
    _Handler.log_path = a.log
    server = ThreadingHTTPServer((HOST, a.port), _Handler)
    timer = threading.Timer(a.seconds, server.shutdown)
    timer.daemon = True
    timer.start()
    print(f"listening http://{HOST}:{a.port}/ for {a.seconds}s", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("stopped", flush=True)


if __name__ == "__main__":
    main()
