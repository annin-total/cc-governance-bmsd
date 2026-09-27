"""UC77 (2) 補足: session_start.py 単体の所要秒（1 本ずつ・N 本同時）。claude は起動しない。

送信先は空（送信プロセスは spool への退避だけ）。hook の 5 秒の上限と比べる。
使い方: python3 time_hook.py
"""

import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

from _common import FIXTURES, Work, conditions, log, summary
from _quiet import wait_quiet

HOOK_TIMEOUT = 5


def _stdin() -> bytes:
    for f in sorted(FIXTURES.glob("*.json")):
        if json.loads(f.read_bytes()).get("hook_event_name") == "SessionStart":
            return f.read_bytes()
    raise RuntimeError("SessionStart の fixture が無い")


def main() -> None:
    work = Work()
    raw = _stdin()
    try:

        def one(i: int) -> float:
            env = work.env(work.terms / f"d{i}")
            env["CLAUDE_CONFIG_DIR"] = str(work.terms / f"c{i}")
            t = time.monotonic()
            subprocess.run(["python3", str(work.plugin / "hooks" / "session_start.py"), "SessionStart"],
                           input=raw, env=env, capture_output=True, timeout=60, check=False)  # fmt: skip
            return time.monotonic() - t

        serial = [one(1000 + i) for i in range(5)]
        log("hook-timing", {"mode": "serial", **summary(serial), **conditions()})
        for n in (5, 10, 20, 40):
            cond = conditions()
            with ThreadPoolExecutor(n) as ex:
                xs = list(ex.map(one, range(n * 100, n * 100 + n)))
            log("hook-timing", {"mode": f"parallel {n}", **summary(xs),
                                "over_5s": sum(x > HOOK_TIMEOUT for x in xs), **cond})  # fmt: skip
    finally:
        wait_quiet(work.terms)  # 切り離された送信プロセス（退避だけ）の完了を待つ
        work.cleanup()


if __name__ == "__main__":
    main()
