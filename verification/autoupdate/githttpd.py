#!/usr/bin/env python3
"""git http-backend を CGI として呼ぶ最小の smart HTTP サーバ（検証用・localhost 限定）."""

import os
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = sys.argv[1]
PORT = int(sys.argv[2])
GIT_BACKEND = (
    subprocess.check_output(["git", "--exec-path"], text=True).strip()
    + "/git-http-backend"
)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def _run(self, body=b""):
        path, _, query = self.path.partition("?")
        env = {
            "GIT_PROJECT_ROOT": ROOT,
            "GIT_HTTP_EXPORT_ALL": "1",
            "PATH_INFO": path,
            "QUERY_STRING": query,
            "REQUEST_METHOD": self.command,
            "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            "CONTENT_LENGTH": str(len(body)),
            "HTTP_CONTENT_ENCODING": self.headers.get("Content-Encoding", ""),
            "REMOTE_ADDR": self.client_address[0],
            "PATH": os.environ["PATH"],
            "HOME": os.environ.get("HOME", "/tmp"),
        }
        for h in ("Git-Protocol", "Accept"):
            v = self.headers.get(h)
            if v:
                env["HTTP_" + h.upper().replace("-", "_")] = v
        proc = subprocess.run(
            [GIT_BACKEND], input=body, env=env, capture_output=True, check=False
        )
        out = proc.stdout
        head, _, payload = out.partition(b"\r\n\r\n")
        status = 200
        headers = []
        for line in head.split(b"\r\n"):
            k, _, v = line.partition(b":")
            k, v = k.strip().decode(), v.strip().decode()
            if k.lower() == "status":
                status = int(v.split()[0])
            elif k:
                headers.append((k, v))
        self.send_response(status)
        for k, v in headers:
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self._run()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        self._run(self.rfile.read(n))

    def log_message(self, *a):
        sys.stderr.write(f"{time.strftime('%H:%M:%S')} {self.path}\n")
        sys.stderr.flush()


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
