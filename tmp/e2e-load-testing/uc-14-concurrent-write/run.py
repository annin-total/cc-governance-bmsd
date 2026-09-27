"""UC 14: 同じ CLAUDE_CONFIG_DIR で N 本を同時に起動し、書き込みの競合を観測する。

使い方: CC_E2E_RUN=a .venv/bin/python run.py <claude|hook> <出力 JSON> N [N ...]
環境変数 UC14_MUTANT=<_settings.py のパス> で壊した実装を配る（判定がゲートするかの確認用）。
"""

import json
import os
import sys
import time
from pathlib import Path

import judge
from uc14_lib import Poller, launch_all, loadavg, mem_free_pct, reset, rows_since, run_claude, run_hook, setup

from _githttp import GitHttpServer
from _root import E2ERoot

MIN_FREE_PCT = 15  # claude 1 本で約 200 MB。これを下回ったら段を飛ばす（ほかのトラックを巻き込まない）


def stage(root, base: bytes, mode: str, n: int, seen: set) -> dict:
    reset(root, base)
    before = {"load": loadavg(), "mem": mem_free_pct()}
    free = int(before["mem"].rsplit(" ", 1)[-1].rstrip("%") or 0)
    if mode == "claude" and free < MIN_FREE_PCT:
        return {"mode": mode, "n": n, "skipped": f"空きメモリ {free}% < {MIN_FREE_PCT}%", "before": before}
    poller = Poller(root.config / "settings.json")
    poller.start()
    fn = (lambda _i: run_claude(root)) if mode == "claude" else (lambda _i: run_hook(root))
    t = time.monotonic()
    results = launch_all(n, fn)
    wall = round(time.monotonic() - t, 1)
    load_after = loadavg()
    root.wait_quiet()
    poller.stop_ev.set()
    poller.join()
    rows = rows_since(root, seen)
    doc = root.run_claude("doctor", timeout=90)
    return {
        "doctor": {"rc": doc.returncode, "invalid_settings": "Invalid settings" in doc.stdout},
        "mode": mode, "n": n, "wall_sec": wall, "before": before, "load_after": load_after,
        "poll": {"reads": poller.reads, "bad": poller.bad, "missing": poller.missing,
                 "bad_samples": poller.bad_samples, "versions_seen": len(poller.mtimes)},
        "settings": judge.settings_checks(root, base),
        "backups": judge.backup_checks(root, base),
        "leftovers": judge.leftover_checks(root),
        "rows": judge.row_checks(rows, judge.completed(results)),
        "hooks": judge.hook_checks(results),
    }  # fmt: skip


def main() -> None:
    mode, out, ns = sys.argv[1], Path(sys.argv[2]), [int(x) for x in sys.argv[3:]]
    extra = {}
    if os.environ.get("UC14_MUTANT"):
        extra["hooks/_settings.py"] = Path(os.environ["UC14_MUTANT"]).read_bytes()
    root = E2ERoot()
    srv = GitHttpServer(root.srv)
    res: dict = {"root": root.path.name, "stages": []}
    seen: set = set()
    try:
        base = setup(root, srv, extra)
        res["warmup_rows"] = len(rows_since(root, seen))
        for n in ns:
            s = stage(root, base, mode, n, seen)
            res["stages"].append(s)
            out.write_text(json.dumps(res, ensure_ascii=False, indent=1))
            if "skipped" in s:
                print(json.dumps(s, ensure_ascii=False), flush=True)
                continue
            h, r = s["hooks"], s["rows"]
            print(json.dumps({
                "n": n, "wall": s["wall_sec"], "load": s["before"]["load"][0], "ok": s["settings"].get("all_ok"),
                "poll_bad": s["poll"]["bad"], "poll_missing": s["poll"]["missing"], "outcome": h["outcome"],
                "no_hook": h["sessions_without_hook"], "stderr": h["stderr_nonempty"], "rows": r["policy_rows"],
                "expected": r["expected"], "by_result": r["by_result"], "backups": s["backups"]["kinds"],
                "tmp": s["leftovers"]["settings_tmp"] + s["leftovers"]["statusline_tmp"],
                "statusline_ok": s["leftovers"]["statusline_ok"], "errors": r["errors"],
                "doctor_invalid": s["doctor"]["invalid_settings"], "load_after": s["load_after"][0],
            }, ensure_ascii=False), flush=True)  # fmt: skip
    finally:
        srv.close()
        out.write_text(json.dumps(res, ensure_ascii=False, indent=1))
        root.cleanup()


if __name__ == "__main__":
    main()
