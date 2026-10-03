"""使い捨て受信器。POST ごとに 1 行の JSON を記録する。応答の遅延・無応答・TLS を選べる。"""
import hashlib
import json
import ssl
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1])
OUT = sys.argv[2]
DELAY = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0  # 負なら応答しない
STATUS = int(sys.argv[4]) if len(sys.argv) > 4 else 200
CERT = sys.argv[5] if len(sys.argv) > 5 else ""
BODY_DIR = OUT + ".bodies"


def _log(rec: dict) -> None:
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a: object) -> None:
        pass

    def do_POST(self) -> None:
        t0 = time.time()
        want = int(self.headers.get("content-length", 0))
        body = b""
        while len(body) < want:
            chunk = self.rfile.read(min(65536, want - len(body)))
            if not chunk:
                break
            body += chunk
        rec = {"t_recv": t0, "t_body": time.time(), "path": self.path,
               "headers": {k.lower(): v for k, v in self.headers.items()},
               "content_length": want, "received": len(body),
               "sha256": hashlib.sha256(body).hexdigest(), "lines": body.count(b"\n")}
        import os
        os.makedirs(BODY_DIR, exist_ok=True)
        with open(f"{BODY_DIR}/{t0:.3f}.bin", "wb") as f:
            f.write(body)
        if DELAY < 0:
            rec["mode"] = "hang"
            _log(rec)
            time.sleep(3600)
            return
        time.sleep(DELAY)
        try:
            self.send_response(STATUS)
            self.send_header("content-length", "2")
            self.end_headers()
            self.wfile.write(b"ok")
            self.wfile.flush()
            rec["reply"] = "sent"
        except OSError as e:
            rec["reply"] = f"failed {type(e).__name__}"
        rec["t_reply"] = time.time()
        _log(rec)


srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
srv.daemon_threads = True
if CERT:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT + ".crt", CERT + ".key")
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
srv.serve_forever()
