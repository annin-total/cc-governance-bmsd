"""UC77 の共通部品: 作業ディレクトリ・サーバ・端末の行の生成・突合・ログ。"""

import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path[:0] = [str(REPO / "e2e")]

from _server import _DB, BASE_PATH, DockerServer, build_context, docker

FIXTURES = REPO / "tests" / "fixtures" / "hook_inputs"
LOG_DIR = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-77-burst-ingest"
)
PREFIX = "cc-e2e-b-uc77-"
ROWS_MIN, ROWS_MAX = 30, 300
_ID_STATS = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);"
    "print(json.dumps(dict(c.execute('select event_id,count(*) from (select event_id from events"
    " union all select event_id from errors union all select event_id from policy_state)"
    " group by event_id').fetchall())))"
)


class Work:
    """$TMPDIR/cc-e2e-b-uc77-*: plugin のコピー・Docker 用の build/tmp・端末の data。"""

    def __init__(self) -> None:
        self.path = Path(os.path.realpath(tempfile.mkdtemp(prefix=PREFIX)))
        for name in ("build", "tmp", "terms", "pycache"):
            (self.path / name).mkdir()
        self.build, self.tmp, self.terms = (self.path / n for n in ("build", "tmp", "terms"))
        self.plugin = self.path / "plugin"
        shutil.copytree(REPO / "plugin", self.plugin,
                        ignore=shutil.ignore_patterns("__pycache__"))  # fmt: skip

    def set_config(self, port: int, token: str, timeout: int = 60) -> None:
        cfg = json.loads((self.plugin / "config.json").read_text("utf-8"))
        cfg.update(ingest_url=f"http://127.0.0.1:{port}{BASE_PATH}/ingest",
                   ingest_token=token, timeout_sec=timeout)  # fmt: skip
        (self.plugin / "config.json").write_text(json.dumps(cfg), "utf-8")

    def env(self, data: Path) -> dict:
        env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG") if k in os.environ}
        env.update(
            CLAUDE_PLUGIN_DATA=str(data), CLAUDE_PLUGIN_ROOT=str(self.plugin),
            CLAUDE_CONFIG_DIR=str(self.path / "config"), TMPDIR=str(self.tmp),
            CC_GOVERNANCE_USER_EMAIL="uc77-template@example.invalid",
            PYTHONPYCACHEPREFIX=str(self.path / "pycache"),
            NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost",
        )  # fmt: skip
        return env

    def cleanup(self) -> None:
        p = self.path
        assert p.name.startswith(PREFIX) and not p.is_symlink()
        shutil.rmtree(p)


def start_server(work: Work, label: str, threads: int = 0) -> DockerServer:
    """本番に近い形のサーバ。`threads` を与えたらコピーの entry.sh にだけ `--threads` を足す。"""
    ctx = build_context(work, label)
    if threads:
        entry = ctx / "entry.sh"
        text = entry.read_text("utf-8")
        old = "waitress-serve --listen=0.0.0.0:5000 app:app"
        assert old in text
        entry.write_text(text.replace(old, f"waitress-serve --threads={threads} --listen=0.0.0.0:5000 app:app"), "utf-8")
    srv = DockerServer(work, label)
    srv.start(ctx)
    srv.wait_ready()
    return srv


def template_rows(work: Work) -> list:
    """実採取の hook stdin を本物の collect.py に通した行（送信先は空なので queue に溜まる）。"""
    data = work.path / "template-data"
    for f in sorted(FIXTURES.glob("*.json")):
        raw = f.read_bytes()
        event = json.loads(raw).get("hook_event_name")
        res = subprocess.run(["python3", str(work.plugin / "hooks" / "collect.py"), event],
                             input=raw, env=work.env(data), capture_output=True,
                             timeout=30, check=False)  # fmt: skip
        assert res.returncode == 0 and not res.stderr, (res.returncode, res.stderr)
    rows = []
    for f in [data / "queue.jsonl", *sorted((data / "spool").glob("*.jsonl"))]:
        if f.exists():
            rows += [json.loads(x) for x in f.read_text("utf-8").splitlines() if x]
    shutil.rmtree(data)
    assert rows and all(r["kind"] == "event" for r in rows), rows[:3]
    return rows


def terminal_rows(templates: list, term: int, tag: str, rng: random.Random) -> list:
    """端末 1 台分（30〜300 行、数セッション、前日の日中）。event_id は毎回新しい。"""
    n = rng.randint(ROWS_MIN, ROWS_MAX)
    base = int(time.time()) - 86400
    out, sid = [], None
    for i in range(n):
        if i % rng.randint(8, 20) == 0 or sid is None:
            sid = str(uuid.uuid4())
        r = dict(rng.choice(templates))
        ts = base + rng.randint(0, 8 * 3600)
        r.update(event_id=str(uuid.uuid4()), session_id=sid, ts=ts, day=ts // 86400,
                 user_email=f"uc77-{tag}-u{term:03d}@example.invalid",
                 host=f"uc77-host-{term:03d}")  # fmt: skip
        out.append(r)
    return out


def ndjson(rows: list) -> bytes:
    return "".join(json.dumps(r, ensure_ascii=True) + "\n" for r in rows).encode()


def db_id_counts(srv: DockerServer) -> dict:
    return json.loads(docker("exec", srv.name, "python3", "-c", _ID_STATS, _DB, timeout=300).stdout)


def account(sent_ids: set, counts: dict) -> dict:
    """送った event_id と DB を突き合わせる。取りこぼし・重複が 1 つでもあれば ok は偽。"""
    mine = {i: counts[i] for i in sent_ids if i in counts}
    missing = len(sent_ids) - len(mine)
    dup_ids = sum(1 for c in mine.values() if c > 1)
    return {"sent": len(sent_ids), "missing": missing, "dup_ids": dup_ids,
            "ok": missing == 0 and dup_ids == 0}  # fmt: skip


def pct(xs: list, p: float) -> float:
    if not xs:
        return float("nan")
    s = sorted(xs)
    return round(s[min(len(s) - 1, round(p / 100 * (len(s) - 1)))], 3)


def summary(xs: list) -> dict:
    return {"n": len(xs), "p50": pct(xs, 50), "p95": pct(xs, 95),
            "max": round(max(xs), 3) if xs else None}  # fmt: skip


def conditions() -> dict:
    """測定条件: load average・Docker の稼働コンテナ数（他トラック分を含む）。"""
    la = os.getloadavg()
    ps = docker("ps", "--format", "{{.Names}}", check=False).stdout.split()
    return {"loadavg": [round(x, 2) for x in la], "containers": len(ps), "at": time.strftime("%H:%M:%S")}


def log(name: str, obj) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(obj, ensure_ascii=False, default=str)
    print(line, flush=True)
    with open(LOG_DIR / f"{name}.jsonl", "a", encoding="utf-8") as f:
        f.write(line + "\n")
