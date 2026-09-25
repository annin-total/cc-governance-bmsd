"""隔離ルート（1 テスト = 1 ルート）。隔離 env の組み立て・claude の起動・証拠の読み出し・片付け。"""

import json
import os
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import pytest

MARKER = ".cc-e2e-root"
KEEP_ENV = "CC_E2E_KEEP"
_PASS_KEYS = (
    "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "TMPDIR", "TEMP", "TMP",
    "SYSTEMROOT", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
)  # fmt: skip
_AUTH_KEYS = ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK")
_FIXED_ENV = {
    "DISABLE_AUTOUPDATER": "1",
    "GIT_TERMINAL_PROMPT": "0",
    "NO_PROXY": "127.0.0.1,localhost",
}
# 起動時点の本物の config。import 時に控える（以後 os.environ を信用しない）
REAL_CONFIG_DIRS = tuple(
    {
        Path.home() / ".claude",
        Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude"),
    }
)
_SETTLE_SEC = 1.0


class SecretEnv(dict):
    """値を表示しない env。ログや assert の差分にトークンを出さない。"""

    def __repr__(self) -> str:
        return f"SecretEnv(keys={sorted(self)})"

    __str__ = __repr__


def auth_env() -> dict:
    """素通しする認証変数。空なら認証なし。"""
    return {
        k: v for k, v in os.environ.items() if k in _AUTH_KEYS or k.startswith("AWS_")
    }


def _real(p) -> Path:
    return Path(os.path.realpath(p))


def _tmp_real() -> Path:
    return _real(tempfile.gettempdir())


class E2ERoot:
    """`config/`・`project/`・`logs/`・`build/`・`srv/` を持つ一時ディレクトリ。"""

    def __init__(self) -> None:
        self.path = _real(tempfile.mkdtemp(prefix="cc-e2e-"))
        (self.path / MARKER).touch()
        for name in ("config", "project", "logs", "build", "srv"):
            (self.path / name).mkdir()
        self.config = self.path / "config"
        self.project = self.path / "project"
        self.logs = self.path / "logs"
        self.build = self.path / "build"
        self.srv = self.path / "srv"
        # hook のバイトコードの置き場。python3 によっては（macOS の Apple 版）ルートの外に書くため
        self.pycache = self.path / "pycache"
        self._pgids: list[int] = []
        self._runs = 0

    def check_isolated(self) -> None:
        """config が本物でなく、目印付きルートの内側にあることを確かめる。違えば起動させない。"""
        config = _real(self.config)
        if any(config == _real(p) for p in REAL_CONFIG_DIRS):
            raise RuntimeError(f"隔離先が本物の config を指している: {config}")
        root = config.parent
        if not (root / MARKER).is_file() or _tmp_real() not in root.parents:
            raise RuntimeError(f"隔離先が目印付きの一時ルートの内側にない: {config}")

    def env(self, auth: bool = False) -> SecretEnv:
        """許可リストで組み直した env。`os.environ` は書き換えない。"""
        self.check_isolated()
        env = SecretEnv({k: os.environ[k] for k in _PASS_KEYS if k in os.environ})
        env.update(_FIXED_ENV, CLAUDE_CONFIG_DIR=str(self.config))
        env["PYTHONPYCACHEPREFIX"] = str(self.pycache)
        if auth:
            env.update(auth_env())
        return env

    def run(self, args: list, timeout: float, auth: bool = False, cwd=None):
        """隔離 env でコマンドを起動し、出力を `logs/` に残す（env は書かない）。終了コードは判定しない。"""
        self._runs += 1
        posix = os.name == "posix"
        proc = subprocess.Popen(
            args, cwd=cwd or self.project, env=self.env(auth), stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8",
            errors="replace", start_new_session=posix,
        )  # fmt: skip
        if posix:
            self._pgids.append(proc.pid)
        start = time.monotonic()
        try:
            out, err = proc.communicate(timeout=timeout)
            rc: Any = proc.returncode
        except subprocess.TimeoutExpired:
            _killpg(proc.pid) if posix else proc.kill()
            out, err = proc.communicate()
            rc = "timeout"
        log = self.logs / f"{self._runs:02d}-{Path(args[0]).name}.log"
        sec = time.monotonic() - start
        log.write_text(
            f"$ {args}\nrc={rc} sec={sec:.1f}\n--- stdout\n{out}\n--- stderr\n{err}\n",
            encoding="utf-8",
        )
        if rc == "timeout":
            raise subprocess.TimeoutExpired(args, timeout, out, err)
        return subprocess.CompletedProcess(args, rc, out, err)

    def run_claude(self, *args: str, timeout: float, auth: bool = False):
        """`claude` を隔離 env で起動する。`--bare` は hook を切るので使わない。"""
        path = shutil.which("claude")
        if path is None:
            pytest.skip("claude が PATH に無い")
        return self.run([path, *args], timeout=timeout, auth=auth)

    def cleanup(self) -> None:
        """残ったプロセスグループを殺し、切り離された送信プロセスを待ってから消す。"""
        for pgid in self._pgids:
            _killpg(pgid)
        time.sleep(_SETTLE_SEC)
        if os.environ.get(KEEP_ENV) == "1":
            sys.stderr.write(f"\n隔離ルートを残した: {self.path}\n")
            return
        p = self.path
        if p.is_symlink() or not (p / MARKER).is_file() or _tmp_real() not in p.parents:
            raise RuntimeError(f"消してよいルートでない: {p}")
        shutil.rmtree(p, onerror=_force_remove)

    # --- 証拠の読み出し
    def pycache_of(self, src_dir: Path) -> Path:
        """`src_dir` の .py を import したときにバイトコードが書かれる場所。"""
        src = _real(src_dir)
        return self.pycache / src.relative_to(src.anchor)

    def json(self, rel: str) -> Any:
        """`config/` からの相対パスの JSON を読む。"""
        return json.loads((self.config / rel).read_text(encoding="utf-8"))

    def plugin_list(self) -> list:
        """`claude plugin list --json` の結果。"""
        res = self.run_claude("plugin", "list", "--json", timeout=60)
        assert res.returncode == 0, res.stderr
        return json.loads(res.stdout)


def hook_rows(data_dir: Path) -> list:
    """queue.jsonl と spool/*.jsonl の和集合（送信先が空でも送信プロセスが spool へ移すため）。"""
    # queue を先に読む。読んだ後に spool へ移されても、後から列挙する spool で拾える
    rows = _jsonl(data_dir / "queue.jsonl")
    for f in sorted((data_dir / "spool").glob("*.jsonl")):
        rows += _jsonl(f)
    return rows


def _jsonl(path: Path) -> list:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return []
    return [json.loads(line) for line in text.splitlines() if line]


def _killpg(pgid: int) -> None:
    try:
        os.killpg(pgid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _force_remove(func, path, _exc) -> None:
    """読み取り専用を解除して再試行する（py39 の rmtree は onexc を持たない）。"""
    os.chmod(path, stat.S_IWRITE | stat.S_IREAD | stat.S_IEXEC)
    func(path)
