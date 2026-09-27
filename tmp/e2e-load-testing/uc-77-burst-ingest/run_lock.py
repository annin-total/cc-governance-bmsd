"""UC77 (1) 補足: DB の 1 操作が busy timeout（5 秒）を超えたとき、同時の /ingest がどうなるか。

コンテナ内の python3 で、書き込みロック（BEGIN IMMEDIATE）か読み取りトランザクションを N 秒握り、
その間に 140 端末分を同時 20 で送る。長い ANALYZE・重い画面のクエリの代わり（機構の確認）。
使い方: CC_E2E_RUN=b-uc77 python3 run_lock.py
"""

import random
import subprocess
import time

from _common import (
    _DB,
    Work,
    account,
    conditions,
    db_id_counts,
    log,
    start_server,
    template_rows,
)
from run_burst import burst, make_batch, server_log_stats

_HOLD = (
    "import sqlite3,sys,time;c=sqlite3.connect(sys.argv[1],isolation_level=None);"
    "c.execute(sys.argv[2]);c.execute('select count(*) from events').fetchone();"
    "print('held',flush=True);time.sleep(float(sys.argv[3]));c.execute('COMMIT')"
)
CASES = (("write", "BEGIN IMMEDIATE", 7.0), ("read", "BEGIN", 7.0), ("write", "BEGIN IMMEDIATE", 3.0))


def main() -> None:
    name = "lock"
    rng = random.Random(7707)
    work = Work()
    srv = None
    try:
        srv = start_server(work, "lock")
        templates = template_rows(work)
        _, bodies, _ = make_batch(templates, "warm", rng)
        burst(srv, bodies[:1], 1)
        for kind, begin, sec in CASES:
            rows, bodies, ids = make_batch(templates, f"{kind}{int(sec)}", rng)
            cond = conditions()
            hold = subprocess.Popen(
                ["docker", "exec", srv.name, "python3", "-c", _HOLD, _DB, begin, str(sec)],
                stdout=subprocess.PIPE, text=True,
            )  # fmt: skip
            assert hold.stdout.readline().strip() == "held"
            t = time.monotonic()
            res = burst(srv, bodies, 20)
            hold.wait(timeout=60)
            counts = db_id_counts(srv)
            per_term = [account({r["event_id"] for r in t}, counts)["ok"] for t in rows]
            log(name, {"case": f"{kind} {sec}s", **res, "account": account(ids, counts),
                       "terminals_stored": sum(per_term), "burst_after_hold_s": round(time.monotonic() - t, 2),
                       **cond})  # fmt: skip
        log(name, {"phase": "end", "server_log": server_log_stats(srv)})
    finally:
        if srv is not None:
            srv.close()
        work.cleanup()


if __name__ == "__main__":
    main()
