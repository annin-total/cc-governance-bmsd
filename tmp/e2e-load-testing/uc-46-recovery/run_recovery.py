"""UC46 (1): 停止中の蓄積と回復・途中停止・応答の喪失・画面の水増し。`CC_E2E_RUN=b-uc46 python run_recovery.py N`"""

import difflib
import re
import socket
import subprocess
import sys
import time
from types import SimpleNamespace

from _harness import BASE_PATH, Work, account, db_stats, docker, log
from _proxy import Proxy
from _server import DockerServer, build_context

N = int(sys.argv[1]) if len(sys.argv) > 1 else 250
L = "recovery"
PAGES = ("/", "/policy", "/effect", "/assets")


def closed_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def restart(server, w) -> None:
    old = server.port
    t = time.monotonic()
    docker("start", server.name)
    server.wait_ready()
    w.set_config(server.port, server.token)
    log(L, {"restart_sec": round(time.monotonic() - t, 1), "port": [old, server.port]})


def pile(w, n: int, tag: str) -> set:
    t = time.monotonic()
    for _ in range(n):
        w.session()
    w.quiet()
    rows = w.rows()
    errs = [r for r in rows if r["kind"] == "error"]
    log(L, {"pile": tag, "sessions": n, "sec": round(time.monotonic() - t, 1),
            "spool_files": len(w.spool()), "rows": len(rows), "error_rows": len(errs),
            "spool_bytes": sum(f.stat().st_size for f in w.spool())})  # fmt: skip
    return {r["event_id"] for r in rows}


def wait_all(server, ids: set, limit: float = 600) -> float:
    t = time.monotonic()
    while not ids <= set(db_stats(server.name)["ids"]):
        if time.monotonic() - t > limit:
            raise TimeoutError("届かない")
        time.sleep(1)
    return time.monotonic() - t


def pages(server) -> str:
    out = []
    for p in PAGES:
        _, body, _ = server.request("GET", server.admin_path(p), auth=True)
        out.append(re.sub(r"<script.*?</script>", "", body, flags=re.DOTALL))
    return "\n".join(out)


def main() -> None:
    w = Work()
    ns = SimpleNamespace(path=w.path, build=w.build, tmp=w.tmp)
    server = DockerServer(ns, "srv")
    proxy = None
    try:
        server.start(build_context(ns, "srv"))
        server.wait_ready()
        w.set_config(server.port, server.token)
        log(L, {"work": str(w.path), "N": N})
        # 0. 平常時に 1 セッションが届くこと（部品の確認）
        # SessionStart の送信は SessionStart の行だけを運ぶ。残りは次の送信で運ばれる
        w.session()
        w.quiet()
        ids0 = {r["event_id"] for r in w.rows()}
        w.send_now()
        log(L, {"phase": 0, "deliver_sec": round(wait_all(server, ids0, 60), 1)})

        # 1. 停止中に N セッション分を積み、再開後に届くまで
        t = time.monotonic()
        docker("stop", server.name)
        log(L, {"docker_stop_sec": round(time.monotonic() - t, 1)})
        ids1 = pile(w, N, "stopped")
        snap = {f.name: f.read_bytes() for f in w.spool()}
        restart(server, w)
        w.session(age=False)  # 10 分以内の次のセッション: 送らないはず
        w.quiet()
        log(L, {"phase": "1-within-10min", "spool_files": len(w.spool())})
        t = time.monotonic()
        w.session()  # 10 分後の次のセッション
        sec = wait_all(server, ids1)
        w.quiet()
        log(L, {"phase": 1, "deliver_sec": round(sec, 1), "total_sec": round(time.monotonic() - t, 1),
                "spool_left": len(w.spool()), **account(ids1 | ids0, db_stats(server.name))})  # fmt: skip

        # 2. 送信の途中でサーバを殺す（SIGKILL）
        docker("kill", server.name)
        ids2 = pile(w, N, "killed")
        restart(server, w)
        total = len(w.spool())
        p = subprocess.Popen(["python3", str(w.plugin / "hooks" / "_sender.py")], env=w.env())
        while len(w.spool()) > total // 2 and p.poll() is None:
            time.sleep(0.02)
        docker("kill", server.name)
        p.wait(timeout=120)
        log(L, {"phase": "2-killed", "spool_before": total, "spool_after_kill": len(w.spool())})
        restart(server, w)
        log(L, {"phase": 2, "send_sec": round(w.send_now(), 1), "spool_left": len(w.spool()),
                **account(ids2, db_stats(server.name))})  # fmt: skip

        # 3. サーバは書き込んだが端末に応答が届かない（切断・時間切れ）
        proxy = Proxy(server.port)
        for mode in ("drop", "hang"):
            w.set_config(closed_port(), server.token)
            ids3 = pile(w, 20, f"closed-{mode}")
            first = len(w.spool()[0].read_text("utf-8").splitlines())
            w.set_config(proxy.port, server.token)
            proxy.mode, proxy.faults, proxy.hang_sec = mode, 1, 7
            s1 = w.send_now()
            left = len(w.spool())
            s2 = w.send_now()
            log(L, {"phase": f"3-{mode}", "rows_in_first_file": first, "run1_sec": round(s1, 1),
                    "spool_after_run1": left, "run2_sec": round(s2, 1),
                    "spool_after_run2": len(w.spool()), "proxy": proxy.log[-3:],
                    **account(ids3, db_stats(server.name))})  # fmt: skip

        # 4. 重複で画面の件数が変わるか（1 の spool をそのまま再投入）。変わる入力でも比べる（ゲート）
        w.set_config(server.port, server.token)
        before = pages(server)
        for body in snap.values():
            st, _, _ = server.request("POST", BASE_PATH + "/ingest", body,
                                      {"X-Ingest-Token": server.token})  # fmt: skip
            assert st == 200, st
        dup = pages(server)
        w.session()
        w.quiet()
        fresh = pages(server)
        d1 = [x for x in difflib.unified_diff(before.splitlines(), dup.splitlines(), lineterm="")]
        d2 = [x for x in difflib.unified_diff(dup.splitlines(), fresh.splitlines(), lineterm="")]
        log(L, {"phase": 4, "replayed_files": len(snap), "diff_after_dup": d1[:40],
                "diff_after_fresh_lines": len(d2), "diff_after_fresh": d2[:20],
                **account(ids1, db_stats(server.name))})  # fmt: skip
    finally:
        if proxy:
            proxy.close()
        server.close()
        try:
            w.quiet()
        finally:
            w.cleanup()


if __name__ == "__main__":
    main()
