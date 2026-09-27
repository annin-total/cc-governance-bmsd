"""UC39: 特殊な値を /ingest へ送り、応答・DB・管理画面を突き合わせる。CC_E2E_RUN を付けて実行する。"""

import json
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path[:0] = [str(REPO / "e2e"), str(HERE)]

from _root import E2ERoot
from _server import _DB, BASE_PATH, DockerServer, build_context, docker
from cases import CASES, NOW, XSS_ATTR, XSS_ROWS, XSS_SCRIPT, line

OUT = (
    REPO.parents[1]
    / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-39-long-values"
)
_DUMP = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row;"
    "print(json.dumps({t:[dict(r) for r in c.execute('SELECT * FROM '+t)] for t in ('events','policy_state','errors')}))"
)
PAGES = ("/", "/policy", "/effect", "/assets")


def normal(tag: str, role: str) -> tuple:
    eid = uuid.uuid4().hex
    return eid, line(
        {
            "kind": "event",
            "event_id": eid,
            "ts": NOW,
            "session_id": f"uc39-{tag}-{role}",
            "hook_event": "Stop",
        }
    )


def send(srv: DockerServer, tag: str, bad: bytes) -> dict:
    (ea, la), (eb, lb) = normal(tag, "A"), normal(tag, "B")
    body = la + b"\n" + bad + b"\n" + lb + b"\n"
    t0 = time.monotonic()
    status, text, _ = srv.request(
        "POST", BASE_PATH + "/ingest", body, {"X-Ingest-Token": srv.token}
    )
    res = {
        "tag": tag,
        "status": status,
        "sec": round(time.monotonic() - t0, 3),
        "bytes": len(body),
        "normals": [ea, eb],
    }
    try:
        res.update(json.loads(text))
    except ValueError:
        res["body_head"] = text[:200]
    return res


def dump(srv: DockerServer) -> dict:
    return json.loads(docker("exec", srv.name, "python3", "-c", _DUMP, _DB).stdout)


def judge(res: dict, exp: dict, db: dict) -> list:
    """期待との食い違いを文字列で返す（空なら一致）。"""
    ids = {r["event_id"] for r in db["events"]}
    bad = [
        r
        for r in db["events"]
        if f"uc39-{res['tag']}" == r["session_id"]
        or r["event_id"] == f"bad-{res['tag']}"
    ]
    miss = []
    want_status = exp.get("status", 200)
    if res["status"] != want_status:
        miss.append(f"status {res['status']} != {want_status}")
    if want_status == 200:
        for k in ("stored", "dropped"):
            if res.get(k) != exp.get(k, 3 - exp["stored"] if k == "dropped" else None):
                miss.append(f"{k} {res.get(k)} != {exp.get(k, 3 - exp['stored'])}")
    kept = sum(e in ids for e in res["normals"])
    if kept != (2 if want_status == 200 else 0):
        miss.append(f"正常行の保存 {kept}/2")
    if "check" in exp and (len(bad) != 1 or not exp["check"](bad[0])):
        miss.append(
            f"対象行の値が期待と違う: {json.dumps(bad, ensure_ascii=True)[:300]}"
        )
    return miss


def check_pages(srv: DockerServer) -> dict:
    out = {}
    for page in PAGES:
        status, html, _ = srv.request("GET", srv.admin_path(page), auth=True)
        out[page] = {
            "status": status,
            "raw_script": html.count(XSS_SCRIPT),
            "raw_attr": html.count(XSS_ATTR),
            "escaped_script": html.count("&lt;script&gt;alert(1)&lt;/script&gt;"),
            "escaped_attr": html.count("&#34;&gt;&lt;img src=x onerror=alert(2)&gt;"),
            "nul": html.count("\x00"),
            "esc": html.count("\x1b"),
        }
        (OUT / f"page{page.replace('/', '_') or '_'}.html").write_text(
            html, "utf-8", errors="surrogatepass"
        )
    return out


def selftest() -> None:
    """判定がゲートしていることを、わざと壊した期待で確かめる。"""
    db = {
        "events": [
            {"event_id": "a", "session_id": "uc39-t", "skill_name": "x" * 255},
            {"event_id": "b", "session_id": "uc39-t-B"},
        ]
    }
    res = {"tag": "t", "status": 200, "stored": 3, "dropped": 0, "normals": ["a", "b"]}
    assert (
        judge(res, {"stored": 3, "check": lambda r: len(r["skill_name"]) == 255}, db)
        == []
    )
    assert judge(res, {"stored": 3, "check": lambda r: len(r["skill_name"]) == 254}, db)
    assert judge(res, {"stored": 2, "dropped": 1}, db)
    assert judge(dict(res, normals=["a", "zz"]), {"stored": 3}, db)
    assert judge(dict(res, status=500), {"stored": 3}, db)
    print("selftest ok")


def main() -> None:
    selftest()
    OUT.mkdir(parents=True, exist_ok=True)
    root = E2ERoot()
    srv = DockerServer(root, "uc39")
    try:
        srv.start(build_context(root, "uc39"))
        srv.wait_ready()
        results = [send(srv, tag, bad) for tag, bad, _ in CASES]
        results += [send(srv, tag, bad) for tag, bad in XSS_ROWS]
        db = dump(srv)
        report = []
        for res, (tag, _, exp) in zip(results, CASES):
            report.append({**res, "miss": judge(res, exp, db)})
        for res in results[len(CASES) :]:
            report.append({**res, "miss": judge(res, {"stored": 3}, db)})
        pages = check_pages(srv)
        (OUT / "db.json").write_text(
            json.dumps(db, ensure_ascii=True)[:5_000_000], "utf-8"
        )
        (OUT / "logs.txt").write_text(srv.logs(), "utf-8")
        (OUT / "report.json").write_text(
            json.dumps({"cases": report, "pages": pages}, ensure_ascii=True, indent=1),
            "utf-8",
        )
        for r in report:
            mark = "NG" if r["miss"] else "ok"
            print(
                f"{mark} {r['tag']:24} status={r['status']} stored={r.get('stored')} dropped={r.get('dropped')} "
                f"{r['sec']}s {r['bytes']}B {'; '.join(r['miss'])}"
            )
        print(json.dumps(pages, indent=1))
    finally:
        srv.close()
        root.cleanup()


if __name__ == "__main__":
    main()
