"""隔離ルート（1 テスト = 1 ルート）。隔離 env の組み立て・claude の起動・証拠の読み出し・片付け。"""

import json
import os
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Optional

import pytest
from _auth import auth_env
from _quiet import wait_quiet

MARKER = ".cc-e2e-root"
KEEP_ENV = "CC_E2E_KEEP"
_PASS_KEYS = (
    "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM",
    "SYSTEMROOT", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    # 社内網の出口（未ログインの起動も外へ出る）。ループバック宛ては NO_PROXY で外す
    "HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy", "NODE_EXTRA_CA_CERTS",
)  # fmt: skip
_LOOPBACK = "127.0.0.1,localhost"
_FIXED_ENV = {
    "DISABLE_AUTOUPDATER": "1",
    "GIT_TERMINAL_PROMPT": "0",
    # 利用者の gitconfig（署名・改行変換・insteadOf など）の影響を消す。git 2.32 以上
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
}
# 本体の自動更新を止める。プラグインは利用者の settings.json の env で DISABLE_AUTOUPDATER を "0" にし、
# それは上の env に勝つ。native 版の更新先は HOME の下（隔離の外）なので、より上位の --settings で真にする
_NO_UPDATE_SETTINGS = json.dumps({"env": {"DISABLE_AUTOUPDATER": "1"}})
# 起動時点の本物の config。import 時に控える（以後 os.environ を信用しない）
REAL_CONFIG_DIRS = tuple(
    {
        Path.home() / ".claude",
        Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude"),
    }
)
# 許可リストの外から、テストが個別に渡してよい変数（無効化スイッチの検証用）
_EXTRA_KEYS = ("CC_GOVERNANCE_DISABLE",)


def _real(p) -> Path:
    return Path(os.path.realpath(p))


def _tmp_real() -> Path:
    return _real(tempfile.gettempdir())


class E2ERoot:
    """`config/`・`project/`・`build/`・`srv/`・`tmp/` を持つ一時ディレクトリ。"""

    def __init__(self) -> None:
        self.path = _real(tempfile.mkdtemp(prefix="cc-e2e-"))
        (self.path / MARKER).touch()
        for name in ("config", "project", "build", "srv", "tmp"):
            (self.path / name).mkdir()
        self.config = self.path / "config"
        self.project = self.path / "project"
        self.build = self.path / "build"
        self.srv = self.path / "srv"
        self.tmp = self.path / "tmp"
        # hook のバイトコードの置き場。python3 によっては（macOS の Apple 版）ルートの外に書くため
        self.pycache = self.path / "pycache"

    def env(self, extra: Optional[dict] = None, auth: bool = False) -> dict:
        """許可リストで組み直した env に `extra`（と `auth` なら認証）を重ねる。`os.environ` は書き換えない。"""
        extra = extra or {}
        assert set(extra) <= set(_EXTRA_KEYS), f"渡せない変数: {sorted(extra)}"
        real = {_real(p) for p in REAL_CONFIG_DIRS}
        assert _real(self.config) not in real, f"隔離先が本物の config: {self.config}"
        env = {k: os.environ[k] for k in _PASS_KEYS if k in os.environ}
        env.update(_FIXED_ENV, CLAUDE_CONFIG_DIR=str(self.config))
        user = os.environ.get("NO_PROXY") or os.environ.get("no_proxy")
        env["NO_PROXY"] = env["no_proxy"] = f"{user},{_LOOPBACK}" if user else _LOOPBACK
        env.update({k: str(self.tmp) for k in ("TMPDIR", "TEMP", "TMP")})
        env["PYTHONPYCACHEPREFIX"] = str(self.pycache)
        env.update(extra)
        if auth:
            env.update(auth_env())
        return env

    def run(
        self, args: list, timeout: float, cwd=None, extra_env: Optional[dict] = None,
        auth: bool = False,
    ) -> subprocess.CompletedProcess:  # fmt: skip
        """隔離 env でコマンドを起動する。終了コードは判定しない。"""
        posix = os.name == "posix"
        proc = subprocess.Popen(
            args, cwd=cwd or self.project, env=self.env(extra_env, auth), stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8",
            errors="replace", start_new_session=posix,
        )  # fmt: skip
        try:
            out, err = proc.communicate(timeout=timeout)
        finally:
            # 取り残し（タイムアウト時は本体も）をその場で止める。終了済みの PGID を後で
            # まとめて殺すと、PID の再利用で無関係なプロセスグループを殺しうる
            if posix:
                _killpg(proc.pid)
            else:
                proc.kill()
            proc.wait()
        return subprocess.CompletedProcess(args, proc.returncode, out, err)

    def run_claude(
        self, *args: str, timeout: float, extra_env: Optional[dict] = None,
        auth: bool = False,
    ) -> subprocess.CompletedProcess:  # fmt: skip
        """`claude` を隔離 env で起動する。`--bare` は hook を切るので使わない。"""
        path = shutil.which("claude")
        if path is None:
            pytest.skip("claude が PATH に無い")
        argv = [path, "--settings", _NO_UPDATE_SETTINGS, *args]
        return self.run(argv, timeout=timeout, extra_env=extra_env, auth=auth)

    def cleanup(self) -> None:
        """切り離された送信プロセスを待ってから消す。待ちきれなければ消さずに失敗する。"""
        try:
            self.wait_quiet()
        except TimeoutError as e:
            raise TimeoutError(f"{e}\n隔離ルートを残した: {self.path}") from e
        if os.environ.get(KEEP_ENV) == "1":
            sys.stderr.write(f"\n隔離ルートを残した: {self.path}\n")
            return
        p = self.path
        if p.is_symlink() or not (p / MARKER).is_file() or _tmp_real() not in p.parents:
            raise RuntimeError(f"消してよいルートでない: {p}")
        shutil.rmtree(p, onerror=_force_remove)

    def wait_quiet(self) -> None:
        """プラグインの data 配下が静止するまで待つ（切り離された送信プロセスの完了待ち）。"""
        wait_quiet(self.config / "plugins" / "data")

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
        assert res.returncode == 0, res.stdout + res.stderr
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
