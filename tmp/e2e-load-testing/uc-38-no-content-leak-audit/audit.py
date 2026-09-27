"""UC 38: 本文を送らないことの監査（一時スクリプト）。

実行（worktree のルートで）:
    set -a; . <.env.local>; set +a; CC_E2E_RUN=c .venv/bin/python tmp/e2e-load-testing/uc-38-no-content-leak-audit/audit.py
標準出力には SENTINEL の値を出さない（本物の transcript に残さないため。すべて redact する）。
"""

import collections
import json
import os
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import runner  # noqa: E402  (e2e/ を sys.path に足す)
import scan  # noqa: E402
from _root import REAL_CONFIG_DIRS, E2ERoot  # noqa: E402
from _server import DockerServer, build_context  # noqa: E402
from recorder import Recorder  # noqa: E402
from scenarios import SCENARIOS as _ALL  # noqa: E402

LOCAL = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-38-no-content-leak-audit"
)
WORKERS = int(os.environ.get("UC38_WORKERS", "4"))
# 送信されるもの・サーバに残るもの。governance（settings.json のバックアップ）と pycache は端末内だけ（LOCAL）
SINKS = ("plugin_data", "plugin_data_preflush", "plugin_cache", "post", "db", "docker_log")
LOCAL_PLUGIN = ("governance", "pycache")
_ONLY = os.environ.get("UC38_ONLY")
SCENARIOS = tuple(s for s in _ALL if not _ONLY or s.name in _ONLY.split(","))
_print_lock = threading.Lock()
TABLE: dict = {}


def log(msg: str) -> None:
    with _print_lock:
        print(scan.redact(msg, TABLE), flush=True)


def _classify(root, out_name: str, p: Path) -> str:
    cfg = root.config
    for cat, base in (
        ("plugin_data", cfg / "plugins" / "data"), ("plugin_cache", cfg / "plugins" / "cache"),
        ("governance", cfg / "governance"), ("pycache", root.pycache),
        ("cc_transcript", cfg / "projects"), ("planted_project", root.project), ("root_tmp", root.tmp),
    ):  # fmt: skip
        if base == p or base in p.parents:
            return cat
    return "cc_other"


def _hit_records(hits, cat_of, rel_to) -> list:
    recs = []
    for p, m in hits:
        rel = str(p.relative_to(rel_to)) if rel_to in p.parents else str(p)
        for label, form in m:
            recs.append({"cat": cat_of(p), "path": rel, "label": label, "form": form})
    return recs


def main() -> None:
    scan.self_test()
    runs_s = {}
    srv_root = E2ERoot()
    server = DockerServer(srv_root, "uc38")
    recorder = None
    outs: list = []
    started = time.time() - 1
    try:
        server.start(build_context(srv_root, "uc38"))
        server.wait_ready()
        recorder = Recorder(server.port, {sc.name for sc in SCENARIOS if sc.fail_first})
        log(f"server ready; recorder :{recorder.port}; workers={WORKERS}")
        t0 = time.monotonic()
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = [ex.submit(_run_one, sc, recorder, server) for sc in SCENARIOS]
            outs = [f.result() for f in futs]
        log(f"all scenarios done in {time.monotonic() - t0:.0f}s")
        for sc, o in zip(SCENARIOS, outs):
            runs_s[sc.name] = o["s"]
        # 受け口に届いた event_id がすべて DB に入るまで待つ
        ids = set()
        for _, _, _, body, status in recorder.posts:
            if 200 <= status < 300:
                ids |= {json.loads(x)["event_id"] for x in body.splitlines() if x.strip()}
        server.wait_event_ids(ids)
        db = server.copy_data(srv_root.tmp / "server")
        dlog = server.logs()
        report = _scan_all(outs, recorder, db, dlog, started, srv_root)
        report["delivered_event_ids"] = len(ids)
        _save(report, runs_s, outs, recorder)
        _summary(report, outs)
    finally:
        for o in outs:
            try:
                runner.cleanup(o)
            except Exception as e:  # noqa: BLE001
                log(f"cleanup failed {o['name']}: {e}")
        if recorder:
            recorder.close()
        server.close()
        srv_root.cleanup()


def _run_one(sc, recorder, server):
    o = runner.run(sc, recorder, server, log)
    for k, v in o["s"].items():
        TABLE[f"{sc.name}:{k}"] = scan.forms(v)
    return o


def _scan_all(outs, recorder, db, dlog, started, srv_root) -> dict:
    recs: list = []
    for o in outs:
        root = o["root"]
        hits = scan.scan_tree(root.path, TABLE)
        for r in _hit_records(hits, lambda p, r=root, n=o["name"]: _classify(r, n, p), root.path):
            recs.append({**r, "where": o["name"]})
    for o in outs:
        for rel, b in o.get("preflush", {}).items():
            for label, form in scan.match(b, TABLE):
                recs.append({"cat": "plugin_data_preflush", "path": rel, "label": label, "form": form, "where": o["name"]})
    for scen, line, _, body, status in recorder.posts:
        for label, form in scan.match(body, TABLE):
            recs.append({"cat": "post", "path": line, "label": label, "form": form, "where": scen, "status": status})
    for r in _hit_records(scan.scan_tree(db, TABLE), lambda p: "db", db):
        recs.append({**r, "where": "server"})
    for label, form in scan.match(dlog.encode(), TABLE):
        recs.append({"cat": "docker_log", "path": "docker logs", "label": label, "form": form, "where": "server"})
    for r in _hit_records(scan.scan_tree(srv_root.path, TABLE, exclude=[db]), lambda p: "srv_root_other", srv_root.path):
        recs.append({**r, "where": "server-root"})
    mine = [o["root"].path for o in outs] + [srv_root.path]
    # 陽性対照: 隔離ルートの外の TMPDIR に置いた canary を、同じ走査が見つけること
    canary = runner.new_sentinels(["tmp"])["tmp"]
    TABLE["canary:tmp"] = scan.forms(canary)
    canary_file = Path(tempfile.gettempdir()) / f"uc38-canary-{os.getpid()}.txt"
    canary_file.write_text(canary, "utf-8")
    for top in {Path(os.path.realpath(tempfile.gettempdir())), Path("/private/tmp")}:
        for r in _hit_records(scan.scan_tree(top, TABLE, exclude=mine, since=started), lambda p: "tmp_outside", top):
            recs.append({**r, "where": str(top)})
    canary_file.unlink()
    for real in REAL_CONFIG_DIRS:
        for r in _hit_records(scan.scan_tree(real, TABLE, since=started), lambda p: "real_config", real):
            recs.append({**r, "where": str(real)})
    return {"hits": recs, "posts": len(recorder.posts), "post_status": collections.Counter(p[4] for p in recorder.posts),
            "docker_log_bytes": len(dlog), "docker_log": dlog}  # fmt: skip


def _save(report, runs_s, outs, recorder) -> None:
    LOCAL.mkdir(parents=True, exist_ok=True)
    (LOCAL / "docker.log").write_text(report.pop("docker_log"), "utf-8")
    (LOCAL / "sentinels.json").write_text(json.dumps(runs_s, indent=2), "utf-8")
    (LOCAL / "hits.json").write_text(json.dumps(report["hits"], indent=1, ensure_ascii=False), "utf-8")
    posts = LOCAL / "posts"
    posts.mkdir(exist_ok=True)
    for i, (scen, line, headers, body, status) in enumerate(recorder.posts):
        (posts / f"{i:03d}-{scen}-{status}.ndjson").write_bytes(body)
    for o in outs:
        rows = o.get("rows", []) + o.get("rows_final", [])
        (LOCAL / f"rows-{o['name']}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows), "utf-8")


def _summary(report, outs) -> None:
    by_design = {f"{sc.name}:{k}" for sc in SCENARIOS for k in sc.by_design}
    agg = collections.defaultdict(set)
    for h in report["hits"]:
        agg[(h["label"], h["cat"])].add(h["form"])
    log(f"posts={report['posts']} status={dict(report['post_status'])} docker_log_bytes={report['docker_log_bytes']}")
    for o in outs:
        extra = {k: o[k] for k in ("error", "undelivered", "synthetic_codes") if o.get(k)}
        log(f"[run] {o['name']} ok={o['ok']} {extra}")
    leaks = []
    for (label, cat), fs in sorted(agg.items()):
        tag = "BY_DESIGN" if label in by_design or label.startswith("canary:") else (
            "LEAK" if cat in SINKS else "LOCAL" if cat in LOCAL_PLUGIN else "info")
        if tag == "LEAK":
            leaks.append((label, cat))
        log(f"[{tag}] {label} in {cat}: {sorted(fs)}")
    log(f"VERDICT leaks={len(leaks)}")


if __name__ == "__main__":
    main()
