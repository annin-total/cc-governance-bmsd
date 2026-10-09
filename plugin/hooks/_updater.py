"""このプラグインの更新を、切り離したプロセスで起動する（子は `python3 _updater.py <claude> <mkt> <plugin>`）。

新しい版は次の起動から効く。失敗・時間切れは記録せず、例外を外に出さない。
"""

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import _identity
import _notices
import _spool

UPDATE_INTERVAL_SEC = 24 * 60 * 60
COMMAND_TIMEOUT_SEC = 300
_UPDATE_AT_FILENAME = "update_at"
_START_SOURCE = "startup"
_SCOPE = "user"
# Windows で `claude.cmd` を起動したときにコンソールの窓を出さない（POSIX では 0）
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_POSIX = os.name != "nt"


def _target() -> Optional[tuple]:
    """(マーケットプレイス名, プラグイン名)。プラグイン名が取れなければ None。"""
    # policy の import の失敗を session_start の import へ波及させない
    import policy

    plugin = _identity.get_plugin_name()
    return (policy.MARKETPLACE, plugin) if plugin else None


def _normalize_dir(path: str) -> Optional[str]:
    """環境変数を展開して正規化する。相対パスは現在のフォルダで意味が変わるので None。"""
    expanded = os.path.expandvars(path)
    if not os.path.isabs(expanded):
        return None
    return os.path.normcase(os.path.normpath(expanded))


def _find_claude() -> Optional[str]:
    """PATH の絶対パスの項目にある `claude`。

    Windows の `shutil.which` は現在のフォルダ（hook が動くプロジェクト）を最優先で探すため、結果のフォルダを確かめる。
    """
    found = shutil.which("claude")
    if found is None:
        return None
    entries = {_normalize_dir(d) for d in os.environ.get("PATH", "").split(os.pathsep)}
    entries.discard(None)
    if _normalize_dir(os.path.dirname(found)) not in entries:
        return None
    return found


def _update_at_path() -> Path:
    return _spool._state_dir() / _UPDATE_AT_FILENAME


def _is_due() -> bool:
    """記録が無いか `UPDATE_INTERVAL_SEC` 以上前なら真。mtime が未来でも真（偽にするとその時刻まで止まる）。"""
    try:
        elapsed = time.time() - _update_at_path().stat().st_mtime
    except FileNotFoundError:
        return True
    except OSError:
        return False
    return elapsed < 0 or elapsed >= UPDATE_INTERVAL_SEC


def _mark() -> bool:
    """今の時刻を記録する。書けたら真。"""
    try:
        path = _update_at_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(exist_ok=True)
    except OSError:
        return False
    return True


def update_if_due(source: object) -> None:
    """対話の `startup` で、前回から `UPDATE_INTERVAL_SEC` 以上たっていれば子を切り離して起動する。待たない。"""
    if source != _START_SOURCE or _notices.is_headless():
        return
    claude = _find_claude()
    if claude is None:
        return
    target = _target()
    if target is None or not _is_due():
        return
    # 起動より前に書く。書けないまま起動すると、開くセッションごとに起動し続ける
    if not _mark():
        return
    try:
        subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), claude, *target],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(_update_at_path().parent),
            start_new_session=True,
        )
    except OSError:
        pass


def _kill(proc: subprocess.Popen) -> None:
    """止める。POSIX では子が起こした孫もグループごと止める。"""
    try:
        if _POSIX:
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
        proc.wait()
    except OSError:
        pass


def _run_one(argv: list) -> None:
    try:
        proc = subprocess.Popen(
            argv,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=_POSIX,
            creationflags=_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return
    try:
        proc.wait(timeout=COMMAND_TIMEOUT_SEC)
    except subprocess.TimeoutExpired:
        _kill(proc)


def run(claude: str, marketplace: str, plugin: str) -> None:
    """カタログを更新してからプラグインを更新する。1 つ目が失敗しても 2 つ目は実行する（手元のカタログで判定するだけ）。"""
    _run_one([claude, "plugin", "marketplace", "update", marketplace])
    _run_one([claude, "plugin", "update", f"{plugin}@{marketplace}", "--scope", _SCOPE])


def _main() -> None:
    args = sys.argv[1:]
    if len(args) != 3:
        return
    run(*args)


if __name__ == "__main__":
    try:
        _main()
    except BaseException:  # noqa: BLE001, S110 (切り離した子は何も出力せずに終わる)
        pass
