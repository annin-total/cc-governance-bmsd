"""UC77 (2): 実セッション（claude -p）を N 並列で起動し、hook → 送信 → DB の到達を数える。

各セッションは別の隔離ルート（CLAUDE_CONFIG_DIR）で、導入は E2E と同じ git 配信のマーケットプレイス。
朝の起動を模して、起動前に spool へ 30〜300 行を置く。
使い方: set -a; . .env.local; set +a; CC_E2E_RUN=b-uc77 python3 run_sessions.py [N]
"""

import json
import random
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from _common import (
    _DB,
    Work,
    account,
    conditions,
    db_id_counts,
    docker,
    log,
    ndjson,
    start_server,
    summary,
    template_rows,
    terminal_rows,
)
from _flow import data_dir, ingest_config, install, install_path
from _githttp import GitHttpServer
from _market import MARKETPLACE, PLUGIN, version
from _root import E2ERoot, hook_rows

INSTALL_PAR = 3
PROMPT = "Reply with the single word ok."
SEND_TIMEOUT_SEC = 60  # 配布の既定値
_BY_SESSION = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);"
    "print(json.dumps(c.execute('select session_id,hook_event,count(*) from events"
    " where session_id in (select value from json_each(?)) group by 1,2',(sys.argv[2],)).fetchall()))"
)


def _prepare(root, gitsrv, srv) -> None:
    cfg = ingest_config(srv.port, srv.token)
    c = json.loads(cfg["config.json"])
    c["timeout_sec"] = SEND_TIMEOUT_SEC
    install(root, gitsrv, version(1), {"config.json": json.dumps(c).encode()})


def _run(root) -> dict:
    t = time.monotonic()
    res = root.run_claude("-p", PROMPT, "--model", "haiku", "--output-format", "stream-json",
                          "--verbose", timeout=300, auth=True)  # fmt: skip
    out: dict = {"rc": res.returncode, "sec": round(time.monotonic() - t, 2), "hooks": []}
    for line in res.stdout.splitlines():
        try:
            m = json.loads(line)
        except ValueError:
            continue
        if m.get("type") == "system" and "hook" in str(m.get("subtype")):
            out["hooks"].append({k: m.get(k) for k in ("subtype", "hook_event", "hook_name", "outcome", "exit_code")})
        if m.get("type") == "result":
            out.update(session_id=m.get("session_id"), cost=m.get("total_cost_usd"))
    return out


def _diag(root, sid) -> dict:
    """起動後（送信の静止後）の端末の状態。"""
    d = data_dir(root)
    rows = hook_rows(d)
    mine: dict = {}
    for x in rows:
        if x.get("session_id") == sid or x["kind"] != "event":
            k = f'{x["kind"]}:{x.get("hook_event") or x.get("stage") or x.get("key_name")}'
            mine[k] = mine.get(k, 0) + 1
    return {"sent_at": (d / "sent_at").exists(), "seed_left": (d / "spool" / "1790000000").parent.exists()
            and any(p.name.startswith("1790000000-") for p in (d / "spool").iterdir()), "local_mine": mine}


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    name = f"sessions-{n}"
    rng = random.Random(7720 + n)
    work = Work()
    srv, roots, gits = None, [], []
    try:
        srv = start_server(work, f"s{n}")
        templates = template_rows(work)
        roots = [E2ERoot() for _ in range(n)]
        gits = [GitHttpServer(r.srv) for r in roots]
        with ThreadPoolExecutor(INSTALL_PAR) as ex:
            list(ex.map(lambda rg: _prepare(rg[0], rg[1], srv), zip(roots, gits)))
        seeded: set = set()
        for i, r in enumerate(roots):
            spool = r.config / "plugins" / "data" / f"{PLUGIN}-{MARKETPLACE}" / "spool"
            spool.mkdir(parents=True)
            rows = terminal_rows(templates, i, f"sess{n}", rng)
            seeded |= {x["event_id"] for x in rows}
            (spool / f"1790000000-{i:03d}.jsonl").write_bytes(ndjson(rows))
        cond = conditions()
        t = time.monotonic()
        with ThreadPoolExecutor(n) as ex:
            runs = list(ex.map(_run, roots))
        wall = time.monotonic() - t
        for r in roots:
            r.wait_quiet()
        quiet = time.monotonic() - t
        diags = [_diag(r, x.get("session_id")) for r, x in zip(roots, runs)]
        for i, (x, dg) in enumerate(zip(runs, diags)):
            log(name, {"phase": "root", "i": i, "sec": x["sec"], "hooks": x["hooks"], **dg})
        counts = db_id_counts(srv)
        sids = [x.get("session_id") for x in runs if x.get("session_id")]
        by_sess = json.loads(docker("exec", srv.name, "python3", "-c", _BY_SESSION, _DB,
                                    json.dumps(sids)).stdout)  # fmt: skip
        local = [hook_rows(data_dir(r)) for r in roots]
        local_ids = {x["event_id"] for rows in local for x in rows}
        local_hooks: dict = {}
        for rows in local:
            for x in rows:
                k = f'{x["kind"]}:{x.get("hook_event") or x.get("stage")}'
                local_hooks[k] = local_hooks.get(k, 0) + 1
        arrived: dict = {}
        for _, ev, c in by_sess:
            arrived[ev] = arrived.get(ev, 0) + c
        log(name, {"phase": "sessions", "n": n, "wall": round(wall, 2), "until_quiet": round(quiet, 2),
                   "rc": sorted({x["rc"] for x in runs}), "claude_sec": summary([x["sec"] for x in runs]),
                   "cost_usd": round(sum(x.get("cost") or 0 for x in runs), 4),
                   "seeded": account(seeded, counts), "arrived_by_hook": arrived, "by_sess": by_sess,
                   "local_left": local_hooks, "local_left_in_db": len(local_ids & set(counts)),
                   "no_session_id": [x for x in runs if not x.get("session_id")], **cond})  # fmt: skip
        # 間引き（10 分）で残った分を、本物の _sender.py で流して全部届くことを確かめる
        for r in roots:
            d, p = data_dir(r), install_path(r)
            (d / "sent_at").unlink(missing_ok=True)
            env = r.env()
            env.update(CLAUDE_PLUGIN_DATA=str(d), CLAUDE_PLUGIN_ROOT=str(p))
            subprocess.run(["python3", str(p / "hooks" / "_sender.py")], env=env, timeout=120, check=False)
        counts = db_id_counts(srv)
        left = sum(len(hook_rows(data_dir(r))) for r in roots)
        log(name, {"phase": "flush", "local_before": account(local_ids, counts), "local_after": left})
    finally:
        for g in gits:
            g.close()
        for r in roots:
            try:
                r.cleanup()
            except Exception as e:  # noqa: BLE001 (残りの片付けを続ける)
                log(name, {"cleanup_error": str(e)})
        if srv is not None:
            srv.close()
        work.cleanup()


if __name__ == "__main__":
    main()
