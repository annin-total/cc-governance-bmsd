"""pytest の共通設定。端末プラグインのモジュールを import 可能にする。"""

import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import pytest

# 利用者本人の config を守る。HOME と CLAUDE_CONFIG_DIR を、読み込み時に環境変数へ直接
# セッション専用の一時ディレクトリを書き込んで固定する。monkeypatch を通さないので、
# テストが monkeypatch.undo() を呼んでも解除されない。子プロセスもこの値を継承する。
# 固定する前に実利用者の config_dir（起動時の CLAUDE_CONFIG_DIR、無ければ ~/.claude）を控え、
# セッションの前後で変化が無いことを確かめる。この検査は事後検出であり、書き込みそのものは防げない。
_REAL_CONFIG_DIR = Path(
    os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
)
_SESSION_HOME = Path(tempfile.mkdtemp(prefix="cc-governance-test-home-"))
os.environ["HOME"] = os.environ["USERPROFILE"] = str(_SESSION_HOME)
os.environ["CLAUDE_CONFIG_DIR"] = str(_SESSION_HOME / ".claude")

# `plugin/` はそのままマーケットプレイスへ差し込まれる配布物である。
# テストが import すると同ディレクトリに `__pycache__` が残り、配布物を汚す。
# `sys.dont_write_bytecode` は親プロセスにしか効かないため、hook を subprocess で
# 起動するテストのために環境変数も立てる（子プロセスが継承する）。
sys.dont_write_bytecode = True
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

# hook は `CLAUDE_CODE_ENTRYPOINT` が `sdk-` で始まるとき、お知らせを既読にしない。
# Claude Code の中から pytest を動かすとこの変数を継承し、結果が呼び出し元で変わるため消す。
# 子プロセスも継承する。起動形態を再現するテストは monkeypatch で個別に立てる。
os.environ.pop("CLAUDE_CODE_ENTRYPOINT", None)

# 本物の `claude` を起動させない。SessionStart は対話の startup で、PATH から探した `claude` で
# プラグインの更新を切り離して起動する。子プロセスもこの PATH を継承する。
os.environ["PATH"] = os.pathsep.join(
    d
    for d in os.environ.get("PATH", "").split(os.pathsep)
    if shutil.which("claude", path=d) is None
)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "plugin" / "hooks"))

HOOK_INPUTS_DIR = ROOT / "tests" / "fixtures" / "hook_inputs"


def iter_hook_inputs(hook_event_name: str) -> Iterator[dict]:
    """`hook_event_name` に一致する fixture を、ファイル名の昇順で 1 件ずつ返す。"""
    for path in sorted(HOOK_INPUTS_DIR.glob("*.json")):
        with open(path, encoding="utf-8") as f:
            obj = json.load(f)
        if obj.get("hook_event_name") == hook_event_name:
            yield obj


@pytest.fixture
def hook_inputs():
    """hook 種別を渡すと、その種別の fixture を 1 件ずつ返すイテレータを作る関数。"""
    return iter_hook_inputs


def _real_config_state() -> tuple:
    """実利用者の settings.json の mtime（無ければ None）と、governance/ 配下の
    (相対パス, mtime, size) の集合。"""
    try:
        mtime = (_REAL_CONFIG_DIR / "settings.json").stat().st_mtime_ns
    except OSError:
        mtime = None
    governance = _REAL_CONFIG_DIR / "governance"
    files = set()
    for path in governance.rglob("*"):
        try:
            stat = path.stat()
        except OSError:
            continue
        files.add(
            (path.relative_to(governance).as_posix(), stat.st_mtime_ns, stat.st_size)
        )
    return mtime, frozenset(files)


_REAL_STATE_AT_START = _real_config_state()


def pytest_sessionfinish(session, exitstatus):
    """実利用者の config がセッション中に変わっていたら、セッションを失敗させる。"""
    shutil.rmtree(_SESSION_HOME, ignore_errors=True)
    after = _real_config_state()
    if after != _REAL_STATE_AT_START:
        sys.stderr.write(
            f"\n実利用者の config が変わった: {_REAL_CONFIG_DIR} "
            f"(settings.json の mtime, governance/ 配下) {_REAL_STATE_AT_START} -> {after}\n"
        )
        session.exitstatus = pytest.ExitCode.TESTS_FAILED


class _IngestReceiver:
    """POST の件数だけを数えるローカルの受け口。送信先を埋めた状態の代わりに使う。"""

    def __init__(self) -> None:
        posts: list = []

        class _Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                posts.append(self.path)
                self.send_response(200)
                self.end_headers()

            def log_message(self, *_args) -> None:
                pass

        self.posts = posts
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.httpd.server_port}/ingest"

    def received(self, within: float) -> int:
        """送信プロセスは detach して動くので、`within` 秒まで待って届いた件数を返す。"""
        deadline = time.monotonic() + within
        while not self.posts and time.monotonic() < deadline:
            time.sleep(0.05)
        return len(self.posts)


@pytest.fixture
def ingest_receiver() -> Iterator[_IngestReceiver]:
    receiver = _IngestReceiver()
    yield receiver
    receiver.httpd.shutdown()
    receiver.httpd.server_close()
