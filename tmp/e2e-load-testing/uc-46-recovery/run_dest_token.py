"""UC46 (2) 送信先の変更（No.45）と (3) トークン不一致（No.48）。`CC_E2E_RUN=b-uc46 python run_dest_token.py M`"""

import re
import sys
import time
from types import SimpleNamespace

from _harness import Work, account, db_stats, docker, log
from _server import DockerServer, build_context

M = int(sys.argv[1]) if len(sys.argv) > 1 else 40
L = "dest_token"


def ids_of(rows: list, kind=None) -> set:
    return {r["event_id"] for r in rows if kind is None or r["kind"] == kind}


def snapshot(w, tag: str, **extra) -> None:
    rows = w.rows()
    log(L, {"at": tag, "spool_files": len(w.spool()), "rows": len(rows),
            "error_rows": sum(r["kind"] == "error" for r in rows),
            "error_types": sorted({r["error_type"] for r in rows if r["kind"] == "error"}),
            "spool_bytes": sum(f.stat().st_size for f in w.spool()), **extra})  # fmt: skip


def dest_change(w, old, new) -> None:
    # 2a. 旧送信先が止まっている間に積み、送信先を新へ変える
    docker("stop", "-t", "1", old.name)
    for _ in range(10):
        w.session()
    w.quiet()
    snapshot(w, "2a-old-stopped")
    pending = ids_of(w.rows())
    w.set_config(new.port, new.token)
    w.session()
    w.quiet()
    log(L, {"at": "2a-after-switch", "spool_left": len(w.spool()),
            "new": account(pending, db_stats(new.name))})  # fmt: skip
    docker("start", old.name)
    old.wait_ready()

    # 2b. 旧送信先は生きているがパスが無い（404）
    w.set_config(old.port, old.token, base="/moved")
    for _ in range(10):
        w.session()
    w.quiet()
    snapshot(w, "2b-old-404")
    pending = ids_of(w.rows())
    w.set_config(new.port, new.token)
    w.session()
    w.quiet()
    log(L, {"at": "2b-after-switch", "spool_left": len(w.spool()),
            "new": account(pending, db_stats(new.name)),
            "old_rows": db_stats(old.name)["events"]})  # fmt: skip

    # 2c. 旧送信先が正常に受けている間の最後のセッションの残り（queue）はどちらへ行くか
    w.set_config(old.port, old.token)
    w.session()
    w.quiet()
    queue_ids = ids_of(w.rows())  # 送信済みのファイルは消えるので、残るのは queue の分
    w.set_config(new.port, new.token)
    w.session()
    w.quiet()
    old_ids, new_ids = set(db_stats(old.name)["ids"]), set(db_stats(new.name)["ids"])
    log(L, {"at": "2c", "queue_rows_at_switch": len(queue_ids),
            "landed_old": len(queue_ids & old_ids), "landed_new": len(queue_ids & new_ids)})  # fmt: skip


def token_mismatch(w, srv) -> None:
    w.set_config(srv.port, srv.token + "x")
    t = time.monotonic()
    for i in range(1, M + 1):
        w.session()
        if i in (1, 2, 5, 10, 20, 30, 40, 60, 80, 100) or i == M:
            w.quiet()
            snapshot(w, f"3-mismatch-after-{i}", sec=round(time.monotonic() - t, 1))
    w.quiet()
    rows = w.rows()
    pending = ids_of(rows)
    w.set_config(srv.port, srv.token)
    w.session()
    w.quiet()
    _, body, _ = srv.request("GET", srv.admin_path("/"), auth=True)
    table = re.search(r'data-testid="error-summary".*?</table>', body, re.DOTALL)
    log(L, {"at": "3-after-fix", "spool_left": len(w.spool()),
            "srv": account(pending, db_stats(srv.name)),
            # 判定のゲート: 届いていない ID を 1 つ混ぜると missing が 1 になること
            "gate_missing": account(pending | {"not-sent-id"}, db_stats(srv.name))["missing"],
            "error_table": re.sub(r"\s+", " ", table.group(0))[:600] if table else None})  # fmt: skip


def main() -> None:
    w = Work()
    ns = SimpleNamespace(path=w.path, build=w.build, tmp=w.tmp)
    servers = {k: DockerServer(ns, k) for k in ("old", "new")}
    try:
        for k, s in servers.items():
            s.start(build_context(ns, k))
        for s in servers.values():
            s.wait_ready()
        log(L, {"work": str(w.path), "M": M})
        dest_change(w, servers["old"], servers["new"])
        w2 = Work()
        try:
            token_mismatch(w2, servers["new"])
        finally:
            w2.quiet()
            w2.cleanup()
    finally:
        for s in servers.values():
            s.close()
        try:
            w.quiet()
        finally:
            w.cleanup()


if __name__ == "__main__":
    main()
