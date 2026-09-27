"""本番に近い形（python:3.9-slim + entry.sh + waitress + BASE_PATH）のサーバに 1 倍の DB を入れ、HTTP で 4 画面を計る。

使い方: CC_E2E_RUN=b-uc76 docker_run.py <DB> <host の測定 JSON（EXPLAIN の SQL 一覧に使う）> <出力 JSON>
手順: 起動 → 停止して DB を差し替え → 再起動 → 画面 x5 → /ingest を 2 回（初回は ANALYZE が走る）→ 画面 x3
→ /ingest の行と直接投入の行の typeof を比べる → コンテナ内の SQLite で EXPLAIN QUERY PLAN を取る。
"""

import base64
import json
import random
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path[:0] = [str(REPO / "e2e"), str(HERE)]

from _root import E2ERoot  # noqa: E402
from _server import _DB, BASE_PATH, DockerServer, build_context, docker  # noqa: E402

SCREENS = ("/", "/policy", "/effect", "/assets")
INGEST_BATCH = 5000
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_EXPLAIN = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);qs=json.load(open(sys.argv[2]));"
    "print(json.dumps({'sqlite':sqlite3.sqlite_version,'plans':[[r[3] for r in c.execute('EXPLAIN QUERY PLAN '+q['sql'],q['params'])] for q in qs]}))"
)


def _http(srv: DockerServer, method: str, path: str, body: bytes = b"", headers=None, timeout: float = 900) -> tuple:
    req = urllib.request.Request(f"http://127.0.0.1:{srv.port}{path}", data=body or None, headers=headers or {}, method=method)
    t = time.perf_counter()
    with _OPENER.open(req, timeout=timeout) as res:
        data = res.read()
        return res.status, time.perf_counter() - t, data


def _screens(srv: DockerServer, runs: int) -> dict:
    cred = base64.b64encode(f"e2e:{srv._password}".encode()).decode()
    out = {}
    for s in SCREENS:
        secs = []
        for _ in range(runs):
            status, sec, _ = _http(srv, "GET", srv.admin_path(s), headers={"Authorization": f"Basic {cred}"})
            assert status == 200, (s, status)
            secs.append(round(sec, 3))
        out[s] = secs
        print(s, secs, flush=True)
    return out


def _ingest_lines(rng: random.Random, today_ts: int, n: int) -> tuple:
    ids, lines = [], []
    for i in range(n):
        eid = str(uuid.UUID(int=rng.getrandbits(128), version=4))
        ids.append(eid)
        row = {"kind": "event", "event_id": eid, "ts": today_ts + i, "user_email": f"u{i % 200:03d}@example.com",
               "host": f"host-{i % 200:03d}-a", "hook_event": "PostToolUse", "session_id": f"s-{i // 50}",
               "tool_name": "Read", "permission_mode": "default", "effort_level": "high", "prompt_id": "p"}  # fmt: skip
        if i % 10 == 0:
            row.update(hook_event="Stop", tool_name=None, context_tokens=40000 + i)
        lines.append(json.dumps(row))
    return ids, "\n".join(lines).encode()


def _env() -> dict:
    up = subprocess.run(["uptime"], capture_output=True, text=True).stdout.strip()
    ps = docker("ps", "--format", "{{.Names}}").stdout.split()
    return {"uptime": up, "docker_ps": ps}


def main() -> None:
    db_path, host_json, out_path = sys.argv[1:4]
    result: dict = {"env_start": _env()}
    root = E2ERoot()
    srv = DockerServer(root, "srv")
    try:
        srv.start(build_context(root, "srv"))
        srv.wait_ready()
        docker("stop", srv.name)
        t = time.perf_counter()
        docker("cp", db_path, f"{srv.name}:{_DB}", timeout=900)
        result["sec_copy"] = round(time.perf_counter() - t, 1)
        t = time.perf_counter()
        docker("start", srv.name)
        srv.wait_ready()
        result["sec_restart"] = round(time.perf_counter() - t, 1)
        result["env_measure"] = _env()
        result["screens_before_ingest"] = _screens(srv, 5)
        ids_all, ingest = [], []
        rng = random.Random(7676)
        for _ in range(2):
            ids, body = _ingest_lines(rng, int(time.time()) - 60, INGEST_BATCH)
            status, sec, data = _http(srv, "POST", BASE_PATH + "/ingest", body,
                                      {"X-Ingest-Token": srv.token, "Content-Type": "application/x-ndjson"})  # fmt: skip
            ingest.append({"status": status, "sec": round(sec, 3), "resp": json.loads(data)})
            ids_all += ids
        result["ingest"] = ingest
        print("ingest", ingest, flush=True)
        result["screens_after_ingest"] = _screens(srv, 3)
        tmp = root.tmp / "ids.json"
        tmp.write_text(json.dumps(ids_all))
        docker("cp", str(tmp), f"{srv.name}:/tmp/ids.json")
        docker("cp", str(HERE / "typecheck.py"), f"{srv.name}:/tmp/typecheck.py")
        tc = docker("exec", srv.name, "python3", "/tmp/typecheck.py", "/app", _DB, "/tmp/ids.json", timeout=900)
        result["typecheck"] = json.loads(tc.stdout)
        host = json.loads(Path(host_json).read_text())["variants"]["analyzed"]
        qs = [{"screen": s, "sql": p["sql"], "params": p["params"], "host_plan": p["plan"]} for s, e in host.items() for p in e["plans"]]
        qf = root.tmp / "qs.json"
        qf.write_text(json.dumps(qs))
        docker("cp", str(qf), f"{srv.name}:/tmp/qs.json")
        ex = json.loads(docker("exec", srv.name, "python3", "-c", _EXPLAIN, _DB, "/tmp/qs.json", timeout=300).stdout)
        result["container_sqlite"] = ex["sqlite"]
        result["plan_diff"] = [
            {"screen": q["screen"], "sql": q["sql"][:120], "host": q["host_plan"], "container": p}
            for q, p in zip(qs, ex["plans"]) if p != q["host_plan"]
        ]  # fmt: skip
        result["container_py"] = docker("exec", srv.name, "python3", "-V").stdout.strip()
        result["env_end"] = _env()
    finally:
        srv.close()
        root.cleanup()
    Path(out_path).write_text(json.dumps(result, ensure_ascii=False, indent=1), "utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in ("typecheck", "plan_diff")}, ensure_ascii=False))
    print("typecheck ok:", result["typecheck"]["ok"], result["typecheck"]["problems"][:5])
    print("plan_diff:", len(result["plan_diff"]))


if __name__ == "__main__":
    main()
