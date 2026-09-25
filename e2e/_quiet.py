"""切り離された送信プロセスの完了待ち（OS に依存しない。PID は見ない）。"""

import contextlib
import os
import time
from pathlib import Path

# 起動の遅れ（数百 ms）より長く静止したら終わったとみなす
_QUIET_SEC = 2.0
_QUIET_TIMEOUT = 60  # _flow.ingest_config の送信タイムアウトより長く
_POLL_SEC = 0.25


def wait_quiet(top: Path) -> None:
    """`top` 配下が `_QUIET_SEC` 静止するまで待つ。応答待ちで止まった送信は完了と見分けられない。"""
    deadline = time.monotonic() + _QUIET_TIMEOUT
    last, since = None, time.monotonic()
    while time.monotonic() < deadline:
        state = _tree_state(top)
        if state != last:
            last, since = state, time.monotonic()
        elif time.monotonic() - since >= _QUIET_SEC:
            return
        time.sleep(_POLL_SEC)
    raise TimeoutError(f"{_QUIET_TIMEOUT} 秒たっても静止しない: {top}")


def _tree_state(top: Path) -> list:
    """`top` 配下のファイルの (パス, サイズ, mtime)。走査中に消えたものは飛ばす。"""
    state = []
    for d, _, files in os.walk(top):
        for path in (os.path.join(d, n) for n in files):
            with contextlib.suppress(FileNotFoundError):
                st = os.stat(path)
                state.append((path, st.st_size, st.st_mtime_ns))
    return sorted(state)
