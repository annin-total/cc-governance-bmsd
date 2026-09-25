"""集計サーバを本番に近い形（Docker イメージ + entry.sh + BASE_PATH + Secret ファイル）で動かす。

バインドマウントを使わない（Colima はホームの外をマウントできない）。Secret は create 後に
`docker cp` で入れてから start する。公開は 127.0.0.1 の空きポートだけ。
"""

import base64
import secrets
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from _market import REPO
from _root import E2ERoot

SERVER_SRC = REPO / "server"
CSV_DIR = "/app/data/csv"
# AIP の公開サブパス `/<workspace_id>/<ingress_path>` と同じ 2 段にする
BASE_PATH = "/e2e-ws/cc-governance-server"
_SECRET_REL = Path("data") / "secrets" / "cc-governance-server.env"
_PORT = "5000/tcp"
# コピーを軽くするだけ。何をイメージに入れるかは server/.dockerignore が決める
_IGNORE = (".git", ".venv", "venv", "__pycache__", "*_cache", ".DS_Store", "*.db")
_BUILD_TIMEOUT = 600
_START_TIMEOUT = 180
_HTTP_TIMEOUT = 30
# 前段のプロキシ設定を使わない（127.0.0.1 宛てが外へ出ないように）
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def docker(*args: str, timeout: float = 120, check: bool = True):
    """docker CLI を呼ぶ。check なら非 0 で例外。"""
    res = subprocess.run(
        ["docker", *args], capture_output=True, encoding="utf-8", errors="replace",
        timeout=timeout, check=False,
    )  # fmt: skip
    if check and res.returncode != 0:
        raise RuntimeError(f"docker {args[0]} が失敗した: {res.stderr}")
    return res


def docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    return docker("info", timeout=30, check=False).returncode == 0


def build_context(root: E2ERoot, label: str) -> Path:
    """`server/` のルート内コピー。`server/` の作業ツリーは書き換えない。"""
    ctx = root.build / f"server-{label}"
    shutil.copytree(SERVER_SRC, ctx, ignore=shutil.ignore_patterns(*_IGNORE))
    return ctx


class DockerServer:
    """1 イメージ + 1 コンテナ（ボリューム・ネットワークは作らない）。`close` で両方消す。"""

    def __init__(self, root: E2ERoot, label: str) -> None:
        # イメージ名は小文字と区切り記号だけ。mkdtemp の名前は小文字・数字・_ から成る
        self.name = f"{root.path.name}-{label}".replace("_", "-")
        self.admin_path = secrets.token_hex(8)
        self.password = secrets.token_urlsafe(16)
        self.token = secrets.token_urlsafe(16)
        self.port: Optional[int] = None
        self._secret_dir = root.tmp / f"secret-{label}"

    def start(self, ctx: Path) -> None:
        """ビルドし、Secret を入れてから起動する。待受の確認はしない。"""
        docker("build", "-q", "-t", self.name, str(ctx), timeout=_BUILD_TIMEOUT)
        env = {
            "DB_DSN": "sqlite:////app/data/e2e.db",
            "INGEST_TOKEN": self.token,
            "CSV_DIR": CSV_DIR,
            "PKG_PROXY": "",
            "ADMIN_PATH": self.admin_path,
            "ADMIN_PASSWORD": self.password,
            "BASE_PATH": BASE_PATH,
        }
        secret = self._secret_dir / _SECRET_REL
        secret.parent.mkdir(parents=True)
        secret.write_text("".join(f"{k}={v}\n" for k, v in env.items()), "utf-8")
        docker("create", "--name", self.name, "-p", f"127.0.0.1::{_PORT}", self.name)
        # /mnt は在り /mnt/data は無い。ディレクトリごと入れて /mnt/data/secrets/... を作る
        docker("cp", str(self._secret_dir / "data"), f"{self.name}:/mnt")
        docker("start", self.name)
        host = docker("port", self.name, _PORT).stdout.splitlines()[0]
        self.port = int(host.rsplit(":", 1)[1])

    def wait_ready(self) -> None:
        """何らかの HTTP 応答が返るまで待つ。先にコンテナが止まればログ付きで失敗する。"""
        deadline = time.monotonic() + _START_TIMEOUT
        while time.monotonic() < deadline:
            try:
                self.request("GET", BASE_PATH + "/")
                return
            except OSError:
                pass
            if self.exit_code() is not None:
                raise RuntimeError(f"サーバが起動前に終了した: {self.logs()}")
            time.sleep(1)
        raise TimeoutError(f"{_START_TIMEOUT} 秒で待ち受けなかった: {self.logs()}")

    def put(self, src: Path, dest_dir: str) -> None:
        """ファイルをコンテナの `dest_dir` へコピーする。"""
        docker("cp", str(src), f"{self.name}:{dest_dir}/{src.name}")

    def exit_code(self) -> Optional[int]:
        fmt = "{{.State.Running}} {{.State.ExitCode}}"
        running, code = docker("inspect", "-f", fmt, self.name).stdout.split()
        return None if running == "true" else int(code)

    def logs(self) -> str:
        res = docker("logs", self.name, check=False)
        return res.stdout + res.stderr

    def admin_url(self, page: str) -> str:
        return f"{BASE_PATH}/{self.admin_path}{page}"

    def request(
        self, method: str, path: str, body: bytes = b"", headers: Optional[dict] = None,
        auth: bool = False,
    ) -> tuple:  # fmt: skip
        """(status, 本文, Content-Type)。HTTP の誤り応答も例外にせず返す。"""
        headers = dict(headers or {})
        if auth:
            cred = base64.b64encode(f"e2e:{self.password}".encode()).decode()
            headers["Authorization"] = f"Basic {cred}"
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}", data=body or None, headers=headers,
            method=method,
        )  # fmt: skip
        try:
            with _OPENER.open(req, timeout=_HTTP_TIMEOUT) as res:
                return (
                    res.status,
                    res.read().decode("utf-8"),
                    res.headers["Content-Type"],
                )
        except urllib.error.HTTPError as e:
            return (
                e.code,
                e.read().decode("utf-8", "replace"),
                e.headers["Content-Type"],
            )

    def close(self) -> None:
        """コンテナとイメージを消す。無くても失敗しない。"""
        docker("rm", "-f", "-v", self.name, check=False)
        docker("image", "rm", "-f", self.name, check=False)
