"""UC77 (1): 140 端末分の /ingest を同時 20・70・140 で送り、応答・画面・取りこぼしを測る。

使い方: CC_E2E_RUN=b-uc77 python3 run_burst.py [--threads N] [--rounds R] [--tag T] [--no-sender]
"""

import argparse
import queue
import random
import subprocess
import threading
import time
import urllib.error
import urllib.request

from _common import (
    BASE_PATH,
    LOG_DIR,
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
)  # fmt: skip

TERMINALS = 140
LEVELS = (20, 70, 140)
CLIENT_TIMEOUT = 60  # _sender.py の既定 timeout_sec と同じ
PROBE_SEC = 0.1
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _post(url: str, token: str, body: bytes) -> tuple:
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/x-ndjson", "X-Ingest-Token": token})  # fmt: skip
    t = time.monotonic()
    try:
        with _OPENER.open(req, timeout=CLIENT_TIMEOUT) as res:
            res.read()
            status = res.status
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception as e:  # noqa: BLE001 (時間切れ・切断を種類で数える)
        status = type(e).__name__
    return status, time.monotonic() - t


def _probe_screen(srv, stop: threading.Event, out: list) -> None:
    """バースト中、`/` を PROBE_SEC 秒おきに叩いて応答時間を積む。"""
    while not stop.is_set():
        t = time.monotonic()
        try:
            status, _, _ = srv.request("GET", srv.admin_path("/"), auth=True)
        except Exception as e:  # noqa: BLE001
            status = type(e).__name__
        out.append((status, time.monotonic() - t))
        stop.wait(PROBE_SEC)


def burst(srv, bodies: list, conc: int) -> dict:
    """`bodies` を同時 `conc` 本で送る（最初の波は Barrier で揃える）。"""
    url = f"http://127.0.0.1:{srv.port}{BASE_PATH}/ingest"
    todo: queue.Queue = queue.Queue()
    for b in bodies:
        todo.put(b)
    results: list = []
    barrier = threading.Barrier(conc)

    def worker() -> None:
        barrier.wait()
        while True:
            try:
                b = todo.get_nowait()
            except queue.Empty:
                return
            results.append(_post(url, srv.token, b))

    screen: list = []
    stop = threading.Event()
    probe = threading.Thread(target=_probe_screen, args=(srv, stop, screen))
    probe.start()
    workers = [threading.Thread(target=worker) for _ in range(conc)]
    t = time.monotonic()
    for w in workers:
        w.start()
    for w in workers:
        w.join()
    wall = time.monotonic() - t
    stop.set()
    probe.join()
    lat = [d for s, d in results if s == 200]
    statuses: dict = {}
    for s, _ in results:
        statuses[str(s)] = statuses.get(str(s), 0) + 1
    return {"conc": conc, "wall": round(wall, 2), "statuses": statuses, "ingest": summary(lat),
            "screen": summary([d for s, d in screen if s == 200]),
            "screen_status": sorted({str(s) for s, _ in screen})}  # fmt: skip


def make_batch(templates: list, tag: str, rng: random.Random) -> tuple:
    rows = [terminal_rows(templates, i, tag, rng) for i in range(TERMINALS)]
    return rows, [ndjson(r) for r in rows], {r["event_id"] for t in rows for r in t}


def gate_check(srv, templates: list, rng: random.Random) -> dict:
    """突合の判定が壊した入力で落ちることを確かめる（3 通り）。"""
    rows, bodies, ids = make_batch(templates, "gate", rng)
    bodies = bodies[:3]
    ids = {r["event_id"] for t in rows[:3] for r in t}
    # (b) 1 端末の最後の行を落として送る（送ったつもりの件数が 1 つずれる）
    cut = bodies[0].rstrip(b"\n").rsplit(b"\n", 1)[0] + b"\n"
    burst(srv, [cut, bodies[1], bodies[2]], 3)
    # (c) 1 端末を 2 回送る
    burst(srv, [bodies[1]], 1)
    counts = db_id_counts(srv)
    ok_ids = ids - {rows[0][-1]["event_id"]}
    res = {
        "honest": account(ok_ids - {r["event_id"] for r in rows[1]}, counts),
        "dropped_line": account(ids - {r["event_id"] for r in rows[1]}, counts),
        "resent": account(ok_ids, counts),
        "bogus_id": account(ok_ids - {r["event_id"] for r in rows[1]} | {"uc77-never-sent"}, counts),
    }
    assert res["honest"]["ok"], res
    assert res["dropped_line"]["missing"] == 1 and not res["dropped_line"]["ok"], res
    assert res["resent"]["dup_ids"] == len(rows[1]) and not res["resent"]["ok"], res
    assert res["bogus_id"]["missing"] == 1 and not res["bogus_id"]["ok"], res
    return res


def real_senders(work: Work, srv, templates: list, rng: random.Random) -> dict:
    """本物の _sender.py を 140 プロセス同時に起動する（端末ごとに spool 1〜5 ファイル）。"""
    ids: set = set()
    datas = []
    for i in range(TERMINALS):
        data = work.terms / f"t{i:03d}"
        (data / "spool").mkdir(parents=True)
        rows = terminal_rows(templates, i, "sender", rng)
        ids |= {r["event_id"] for r in rows}
        k = rng.randint(1, 5)
        for j in range(k):
            chunk = rows[j::k]
            (data / "spool" / f"{1790000000 + j}-{i:03d}{j}.jsonl").write_bytes(ndjson(chunk))
        datas.append(data)
    exe = str(work.plugin / "hooks" / "_sender.py")
    t = time.monotonic()
    procs = [(subprocess.Popen(["python3", exe], env=work.env(d), stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE), time.monotonic()) for d in datas]  # fmt: skip
    times, stderr = [], 0
    for p, t0 in procs:
        _, err = p.communicate(timeout=600)
        times.append(time.monotonic() - t0)
        stderr += bool(err)
    wall = time.monotonic() - t
    left = sum(len(list((d / "spool").glob("*.jsonl"))) for d in datas)
    queued = sum((d / "queue.jsonl").exists() for d in datas)  # append_error は queue に書く
    acc = account(ids, db_id_counts(srv))
    return {"wall": round(wall, 2), "proc": summary(times), "spool_left": left,
            "queue_files(errors)": queued, "stderr": stderr, "account": acc}  # fmt: skip


def server_log_stats(srv) -> dict:
    text = srv.logs()
    return {k: text.count(k) for k in ("Task queue depth", "Traceback", "database is locked", "Error")}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--rounds", type=int, default=2)
    ap.add_argument("--tag", default="t4")
    ap.add_argument("--no-sender", action="store_true")
    args = ap.parse_args()
    name = f"burst-{args.tag}"
    rng = random.Random(77)
    work = Work()
    srv = None
    try:
        log(name, {"phase": "start", "threads": args.threads or "default", **conditions()})
        srv = start_server(work, args.tag, args.threads)
        work.set_config(srv.port, srv.token)
        templates = template_rows(work)
        log(name, {"phase": "templates", "rows": len(templates)})
        _, bodies, ids = make_batch(templates, "warm", rng)
        warm = burst(srv, bodies[:1], 1)
        idle = []
        for _ in range(5):
            t = time.monotonic()
            srv.request("GET", srv.admin_path("/"), auth=True)
            idle.append(time.monotonic() - t)
        log(name, {"phase": "warmup", "first_ingest(analyze)": warm["ingest"], "screen_idle": summary(idle)})
        for conc in LEVELS:
            for r in range(args.rounds):
                rows, bodies, ids = make_batch(templates, f"c{conc}r{r}", rng)
                cond = conditions()
                res = burst(srv, bodies, conc)
                acc = account(ids, db_id_counts(srv))
                nrows = sum(len(x) for x in rows)
                log(name, {"phase": "burst", "round": r, "rows": nrows, "bytes": sum(map(len, bodies)),
                           **res, "account": acc, **cond})  # fmt: skip
        log(name, {"phase": "gate", **gate_check(srv, templates, rng)})
        if not args.no_sender:
            log(name, {"phase": "real_sender", **real_senders(work, srv, templates, rng), **conditions()})
        size = docker("exec", srv.name, "ls", "-l", "/app/data", check=False).stdout
        log(name, {"phase": "end", "server_log": server_log_stats(srv), "data_dir": size})
    finally:
        if srv is not None:
            (LOG_DIR / f"{name}-server.log").write_text(srv.logs(), "utf-8")
            srv.close()
        work.cleanup()


if __name__ == "__main__":
    main()
