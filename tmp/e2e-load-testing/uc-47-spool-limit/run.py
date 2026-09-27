"""UC47 の 1〜4: 上限での破棄・上限超えの 1 ファイル・長期オフライン・送信先が空の版。CC_E2E_RUN を付けて実行する。"""

import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path[:0] = [str(__import__("pathlib").Path(__file__).resolve().parent)]
from harness import (
    DAY,
    LOCAL,
    MB,
    REPO,
    Box,
    closed_port_url,
    rows_of,
    tmp_base,
)

sys.path.insert(0, str(REPO / "e2e"))
from _root import E2ERoot
from _server import _DB, BASE_PATH, DockerServer, build_context, docker

assert os.environ.get("CC_E2E_RUN") == "b-uc47", "CC_E2E_RUN=b-uc47 を付ける"
_COUNT = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);"
    "print(json.dumps({'events':dict(c.execute('SELECT session_id,count(*) FROM events GROUP BY session_id').fetchall()),"
    "'errors':[list(r) for r in c.execute('SELECT stage,error_type,count(*) FROM errors GROUP BY 1,2')]}))"
)
REPORT: dict = {}


def db(srv: DockerServer) -> dict:
    return json.loads(docker("exec", srv.name, "python3", "-c", _COUNT, _DB).stdout)


def errors_in(box: Box) -> list:
    return [(r["stage"], r["error_type"]) for r in box.spool_rows() if r.get("kind") == "error"]


def prune_ok(before: list, after_names: set, max_bytes: int) -> list:
    """容量の破棄が「mtime の古い順の接頭辞を、合計が上限以下になるまで」であるかを見る。食い違いを返す。"""
    order = sorted(before, key=lambda f: f["mtime"])
    kept = [f for f in order if f["name"] in after_names]
    gone = [f for f in order if f["name"] not in after_names]
    miss = []
    if order[: len(gone)] != gone:
        miss.append(f"消えたのが古い順の接頭辞でない: {[f['tag'] for f in gone]}")
    total = sum(f["size"] for f in kept)
    if total > max_bytes:
        miss.append(f"残りの合計 {total} > 上限")
    if gone and total + gone[-1]["size"] <= max_bytes:
        miss.append("消しすぎ（最後に消したものを戻しても上限以下）")
    return miss


def snapshot(box: Box) -> list:
    out = []
    for p in box.spool.glob("*.jsonl"):
        st = p.stat()
        first = json.loads(p.open().readline())
        tag = first.get("session_id") or f"error-file:{first.get('error_type')}"
        out.append({"name": p.name, "tag": tag, "size": st.st_size, "mtime": st.st_mtime, "rows": rows_of(p)})
    return out


def s1_capacity(base, url, srv, mutate: bool = False) -> dict:
    box = Box(base, "s1" + ("-mut" if mutate else ""))
    if mutate:
        f = box.plugin / "hooks/_spool.py"
        f.write_text(f.read_text().replace("key=lambda item: item[0])", "key=lambda item: item[0], reverse=True)"))
    box.config(closed_port_url())
    now = time.time()
    for i in range(8):
        box.seed(f"s1-f{i}", MB, age_days=(8 - i) * 0.1)
    # 名前（epoch）は最新なのに mtime は最古のファイル: 送る順と消す順の基準の違いを見る
    box.seed("s1-fx", MB, epoch=int(now) + 10, mtime=now - 0.9 * DAY)
    box.hook("PostToolUse", "s1-q")
    before = snapshot(box)
    box.sender()
    after = snapshot(box)
    res = {"before": [(f["tag"], f["size"]) for f in sorted(before, key=lambda f: f["mtime"])],
           "kept": sorted(f["tag"] for f in after), "errors": errors_in(box)}  # fmt: skip
    rotated = [f for f in after if f["tag"] == "s1-q"]
    res["queue_rotated"] = bool(rotated) and not box.queue.exists()
    res["judge"] = prune_ok(before + rotated, {f["name"] for f in after}, 5 * MB)
    if mutate or srv is None:
        return res
    box.config(url, srv.token)
    box.sender()
    got = db(srv)["events"]
    res["delivered"] = {t: got.get(t, 0) for t in sorted({f["tag"] for f in before + rotated})}
    res["expect_delivered"] = {f["tag"]: f["rows"] for f in after}
    res["spool_after_resume"] = box.files()
    return res


def s2_oversize(base, url, srv) -> dict:
    out = {}
    box = Box(base, "s2a")
    box.config(url, srv.token)
    box.seed("s2a-small", MB // 10, age_days=0.2)
    big = box.seed("s2a-big12", 12 * MB, age_days=0.1)
    rows = rows_of(big)
    t = box.sender()
    out["reachable_12MB"] = {"sec": round(t, 2), "rows": rows, "delivered": db(srv)["events"].get("s2a-big12", 0),
                             "spool_after": box.files(), "errors": errors_in(box)}  # fmt: skip
    box = Box(base, "s2b")
    box.config(url, srv.token)
    huge = box.seed("s2b-huge50", 50 * MB, age_days=0.1)
    rows = rows_of(huge)
    t = box.sender()
    out["reachable_50MB"] = {"sec": round(t, 2), "rows": rows, "delivered": db(srv)["events"].get("s2b-huge50", 0),
                             "spool_after": box.files(), "errors": errors_in(box)}  # fmt: skip
    box = Box(base, "s2c")
    box.config(closed_port_url())
    box.seed("s2c-big12", 12 * MB, age_days=0.1)
    box.sender()
    out["unreachable_12MB"] = {"spool_after": box.files(), "errors": errors_in(box)}
    for read_body in (True, False):
        stub = Stub413(read_body)
        box = Box(base, f"s2d-{'read' if read_body else 'noread'}")
        box.config(stub.url)
        box.seed("s2d-big12", 12 * MB, age_days=0.2)
        box.seed("s2d-mid2", 2 * MB, age_days=0.1)
        runs = []
        for _ in range(3):
            box.sender()
            runs.append({"requests": list(stub.sizes), "spool": sorted(f["tag"] for f in snapshot(box)),
                         "errors": errors_in(box)})  # fmt: skip
            stub.sizes.clear()
        stub.close()
        out[f"stub413_{'read' if read_body else 'noread'}"] = runs
    return out


class Stub413:
    """全要求に 413 を返すローカルのスタブ。`read_body` が偽なら本文を読まずに閉じる（前段のプロキシを模す）。"""

    def __init__(self, read_body: bool) -> None:
        sizes: list = []
        self.sizes = sizes

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                n = int(self.headers.get("Content-Length", 0))
                sizes.append(n)
                if read_body:
                    self.rfile.read(n)
                self.send_response(413)
                self.send_header("Content-Length", "0")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True

            def log_message(self, *a):
                pass

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}/ingest"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.srv.shutdown()
        self.srv.server_close()


def _seed_days(box: Box, tag: str) -> None:
    for d in range(14):
        box.seed(f"{tag}-d{d:02d}", 50 * 1024, age_days=d + 0.5)
    box.seed(f"{tag}-edge-in", 1024, mtime=time.time() - 7 * DAY + 120)
    box.seed(f"{tag}-edge-out", 1024, mtime=time.time() - 7 * DAY - 120)


def age_ok(before: list, after_names: set, days: int = 7) -> list:
    now = time.time()
    miss = []
    for f in before:
        old = now - f["mtime"] > days * DAY
        if old == (f["name"] in after_names):
            miss.append(f"{f['tag']} の扱いが日数の規則と違う（old={old}）")
    return miss


def s3_offline(base, url, srv, mutate: bool = False) -> dict:
    out = {}
    if not mutate:
        box = Box(base, "s3a")
        _seed_days(box, "s3a")
        before = snapshot(box)
        box.config(url, srv.token)
        box.sender()
        got = db(srv)["events"]
        out["machine_off"] = {"delivered": {f["tag"]: got.get(f["tag"], 0) for f in before},
                              "rows": {f["tag"]: f["rows"] for f in before}, "spool_after": box.files()}  # fmt: skip
    box = Box(base, "s3b" + ("-mut" if mutate else ""))
    if mutate:
        f = box.plugin / "hooks/_spool.py"
        f.write_text(f.read_text().replace("max_age_sec = max_days * _SECONDS_PER_DAY", "max_age_sec = max_days * _SECONDS_PER_DAY * 2"))
    _seed_days(box, "s3b")
    before = snapshot(box)
    box.config(closed_port_url())
    box.sender()
    after_names = set(box.files())
    res = {"kept": sorted(f["tag"] for f in before if f["name"] in after_names), "errors": errors_in(box),
           "judge": age_ok(before, after_names)}  # fmt: skip
    if not mutate:
        box.config(url, srv.token)
        box.sender()
        got = db(srv)["events"]
        res["delivered"] = {f["tag"]: got.get(f["tag"], 0) for f in before if got.get(f["tag"])}
    out["server_down_machine_on"] = res
    return out


def s4_paused(base, url, srv) -> dict:
    box = Box(base, "s4")
    box.config("")
    box.seed("s4-old10d", 50 * 1024, age_days=10)
    box.seed("s4-bulk6MB", 6 * MB, age_days=1)
    periods = []
    for p in range(5):
        for _ in range(3):
            box.hook("PostToolUse", f"s4-p{p}")
        box.age_sent_at()
        sec, code, out = box.hook("Stop", f"s4-p{p}")
        box.wait_sender()
        periods.append({"stop_sec": round(sec, 3), "exit": code, "output": out, "queue_exists": box.queue.exists(),
                        "spool": sorted(f["tag"] for f in snapshot(box))})  # fmt: skip
    arrived_during_pause = {k: v for k, v in db(srv)["events"].items() if k.startswith("s4-")}
    box.config(url, srv.token)
    box.age_sent_at()
    box.hook("Stop", "s4-after")
    box.wait_sender()
    got = db(srv)["events"]
    res = {"periods": periods, "arrived_during_pause": arrived_during_pause, "errors": errors_in(box),
           "delivered_after": {k: v for k, v in got.items() if k.startswith("s4-")}, "spool_after": box.files()}  # fmt: skip
    # config.json が無い・壊れた版では、送信プロセスが退避も破棄もしない（_load_config が None で return）
    box2 = Box(base, "s4-noconfig")
    (box2.plugin / "config.json").unlink()
    sizes = []
    for p in range(3):
        box2.hook("PostToolUse", f"s4n-p{p}")
        box2.age_sent_at()
        box2.hook("Stop", f"s4n-p{p}")
        box2.wait_sender()
        sizes.append({"queue_rows": rows_of(box2.queue) if box2.queue.exists() else 0, "spool": box2.files()})
    res["no_config"] = sizes
    return res


def selftest() -> None:
    """判定が壊れた入力で落ちることを先に確かめる。"""
    fs = [{"name": str(i), "tag": str(i), "size": MB, "mtime": i} for i in range(8)]
    assert prune_ok(fs, {str(i) for i in range(3, 8)}, 5 * MB) == []
    assert prune_ok(fs, {str(i) for i in range(5)}, 5 * MB)  # 新しい順に消した
    assert prune_ok(fs, {str(i) for i in range(2, 8)}, 5 * MB)  # 消し足りない
    assert prune_ok(fs, {str(i) for i in range(4, 8)}, 5 * MB)  # 消しすぎ
    now = time.time()
    gs = [{"name": "a", "tag": "a", "mtime": now - 8 * DAY}, {"name": "b", "tag": "b", "mtime": now - 6 * DAY}]
    assert age_ok(gs, {"b"}) == []
    assert age_ok(gs, {"a", "b"}) and age_ok(gs, set())


def main() -> None:
    selftest()
    base = tmp_base()
    root = E2ERoot()
    srv = DockerServer(root, "uc47")
    try:
        t0 = time.monotonic()
        srv.start(build_context(root, "uc47"))
        srv.wait_ready()
        REPORT["server_start_sec"] = round(time.monotonic() - t0, 1)
        url = f"http://127.0.0.1:{srv.port}{BASE_PATH}/ingest"
        want = set(sys.argv[1:]) or {"s1", "s2", "s3", "s4"}
        if "s1" in want:
            REPORT["s1"] = s1_capacity(base, url, srv)
            REPORT["s1_mutated"] = s1_capacity(base, url, None, mutate=True)
        if "s3" in want:
            REPORT["s3"] = s3_offline(base, url, srv)
            REPORT["s3_mutated"] = s3_offline(base, url, srv, mutate=True)
        if "s4" in want:
            REPORT["s4"] = s4_paused(base, url, srv)
        if "s2" in want:
            REPORT["s2"] = s2_oversize(base, url, srv)
        REPORT["server_errors_table"] = db(srv)["errors"]
        logs = srv.logs()
        (LOCAL / "server-logs.txt").write_text(logs, "utf-8")
        REPORT["server_log_tail"] = logs.splitlines()[-15:]
    finally:
        (LOCAL / f"report-{'-'.join(sys.argv[1:]) or 'all'}.json").write_text(json.dumps(REPORT, ensure_ascii=False, indent=1, default=str), "utf-8")
        srv.close()
        root.cleanup()
        import shutil

        shutil.rmtree(base, ignore_errors=True)
    print(json.dumps(REPORT, ensure_ascii=False, indent=1, default=str)[:20000])


if __name__ == "__main__":
    main()
