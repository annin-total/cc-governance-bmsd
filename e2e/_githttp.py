"""`srv/` の bare リポジトリを smart HTTP で配る最小サーバ（127.0.0.1・デーモンスレッド）。

`claude plugin marketplace add` は bare を直接指せないため、git-http-backend を CGI として呼ぶ。
"""

import shutil
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def _backend() -> str:
    exec_path = subprocess.check_output(["git", "--exec-path"], text=True).strip()
    found = shutil.which("git-http-backend", path=exec_path)
    if found is None:
        raise RuntimeError("git-http-backend が見つからない")
    return found


class GitHttpServer:
    """起動中の間 `url(name)` で bare を配り、受けた要求の (メソッド, パス) を `requests` に積む。"""

    def __init__(self, project_root: Path) -> None:
        self.requests: list = []
        handler = _make_handler(str(project_root), _backend(), self.requests)
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.port = self._server.server_address[1]
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def url(self, name: str) -> str:
        return f"http://127.0.0.1:{self.port}/{name}.git"

    def close(self) -> None:
        """止めて、ポートが閉じたことを確かめる。"""
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)
        try:
            socket.create_connection(("127.0.0.1", self.port), timeout=1).close()
        except OSError:
            return
        raise RuntimeError(f"git サーバのポートが閉じていない: {self.port}")


def _make_handler(project_root: str, backend: str, requests: list) -> type:
    class _Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"

        def _cgi(self, body: bytes = b"") -> None:
            path, _, query = self.path.partition("?")
            requests.append((self.command, self.path))
            env = {
                "GIT_PROJECT_ROOT": project_root,
                "GIT_HTTP_EXPORT_ALL": "1",
                "PATH_INFO": path,
                "QUERY_STRING": query,
                "REQUEST_METHOD": self.command,
                "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                "CONTENT_LENGTH": str(len(body)),
                "HTTP_CONTENT_ENCODING": self.headers.get("Content-Encoding", ""),
                "HTTP_GIT_PROTOCOL": self.headers.get("Git-Protocol", ""),
            }
            out = subprocess.run(
                [backend], input=body, env=env, capture_output=True, check=False
            ).stdout
            head, _, payload = out.partition(b"\r\n\r\n")
            status, headers = 200, []
            for line in head.split(b"\r\n"):
                key, _, value = (
                    s.strip() for s in line.decode("latin-1").partition(":")
                )
                if key.lower() == "status":
                    status = int(value.split()[0])
                elif key:
                    headers.append((key, value))
            self.send_response(status)
            for key, value in headers:
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self) -> None:
            self._cgi()

        def do_POST(self) -> None:
            self._cgi(self.rfile.read(int(self.headers.get("Content-Length", 0))))

        def log_message(self, *args) -> None:
            pass

    return _Handler
