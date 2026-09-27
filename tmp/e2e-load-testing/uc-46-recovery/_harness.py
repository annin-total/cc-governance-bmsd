"""UC46 の共通部品: 作業ディレクトリ・hook の直接起動・送信・DB の集計。"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path[:0] = [str(REPO / "e2e")]

from _quiet import wait_quiet
from _server import _DB, BASE_PATH, docker

FIXTURES = REPO / "tests" / "fixtures" / "hook_inputs"
LOG_DIR = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-46-recovery"
)
PREFIX = "cc-e2e-b-uc46-"
SESSION = ("SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolUse",
           "UserPromptSubmit", "PostToolUse", "PostToolUse", "Stop")  # fmt: skip
_DB_STATS = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);o={}\n"
    "for t in ('events','errors','policy_state'):\n"
    " o[t]=c.execute('select count(*),count(distinct event_id) from '+t).fetchone()\n"
    "o['ids']=dict(c.execute('select event_id,count(*) from (select event_id from events"
    " union all select event_id from errors union all select event_id from policy_state)"
    " group by event_id').fetchall())\n"
    "o['err']=c.execute('select stage,error_type,count(*),count(distinct event_id) from errors"
    " group by 1,2').fetchall()\n"
    "print(json.dumps(o))"
)


def load_fixtures() -> dict:
    """hook_event_name ごとの実採取 stdin（バイト列のリスト）。"""
    out: dict = {}
    for f in sorted(FIXTURES.glob("*.json")):
        raw = f.read_bytes()
        out.setdefault(json.loads(raw).get("hook_event_name"), []).append(raw)
    return out


class Work:
    """$TMPDIR/cc-e2e-b-uc46-*: plugin のコピー・data・config・Docker 用の build/tmp。"""

    def __init__(self) -> None:
        self.path = Path(os.path.realpath(tempfile.mkdtemp(prefix=PREFIX)))
        for name in ("build", "tmp", "data", "config", "pycache"):
            (self.path / name).mkdir()
        self.build, self.tmp, self.data = (self.path / n for n in ("build", "tmp", "data"))
        self.plugin = self.path / "plugin"
        shutil.copytree(REPO / "plugin", self.plugin,
                        ignore=shutil.ignore_patterns("__pycache__"))  # fmt: skip
        self.fx = load_fixtures()
        self._n = 0

    def set_config(self, port: int, token: str, timeout: int = 5, base: str = BASE_PATH) -> None:
        cfg = json.loads((self.plugin / "config.json").read_text("utf-8"))
        url = f"http://127.0.0.1:{port}{base}/ingest" if port else ""
        cfg.update(ingest_url=url, ingest_token=token, timeout_sec=timeout)
        (self.plugin / "config.json").write_text(json.dumps(cfg), "utf-8")

    def env(self) -> dict:
        env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG") if k in os.environ}
        env.update(
            CLAUDE_PLUGIN_DATA=str(self.data), CLAUDE_PLUGIN_ROOT=str(self.plugin),
            CLAUDE_CONFIG_DIR=str(self.path / "config"), TMPDIR=str(self.tmp),
            CC_GOVERNANCE_USER_EMAIL="uc46@example.invalid",
            PYTHONPYCACHEPREFIX=str(self.path / "pycache"),
            NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost",
        )  # fmt: skip
        return env

    def hook(self, event: str) -> None:
        cands = self.fx[event]
        self._n += 1
        res = subprocess.run(
            ["python3", str(self.plugin / "hooks" / "collect.py"), event],
            input=cands[self._n % len(cands)], env=self.env(), capture_output=True, timeout=30, check=False,
        )  # fmt: skip
        assert res.returncode == 0 and not res.stderr, (res.returncode, res.stderr)

    def age_sent_at(self) -> None:
        """「前の送信から 10 分以上たった」状態にする。"""
        p = self.data / "sent_at"
        if p.exists():
            t = time.time() - 601
            os.utime(p, (t, t))

    def session(self, age: bool = True) -> None:
        if age:
            self.age_sent_at()
        for ev in SESSION:
            self.hook(ev)

    def send_now(self) -> float:
        """送信プロセスを同期で 1 回動かし、所要秒を返す。"""
        t = time.monotonic()
        subprocess.run(["python3", str(self.plugin / "hooks" / "_sender.py")],
                       env=self.env(), capture_output=True, timeout=900, check=False)  # fmt: skip
        return time.monotonic() - t

    def quiet(self) -> None:
        wait_quiet(self.data)

    def spool(self) -> list:
        return sorted((self.data / "spool").glob("*.jsonl"))

    def rows(self) -> list:
        out = []
        for f in [self.data / "queue.jsonl", *self.spool()]:
            if f.exists():
                out += [json.loads(x) for x in f.read_text("utf-8").splitlines() if x]
        return out

    def cleanup(self) -> None:
        p = self.path
        assert p.name.startswith(PREFIX) and not p.is_symlink()
        shutil.rmtree(p)


def db_stats(name: str) -> dict:
    return json.loads(docker("exec", name, "python3", "-c", _DB_STATS, _DB).stdout)


def account(sent_ids: set, stats: dict) -> dict:
    """送った event_id の集合と DB を突き合わせる。"""
    ids = stats["ids"]
    return {
        "local": len(sent_ids),
        "missing": len(sent_ids - set(ids)),
        "dup_ids": sum(1 for c in ids.values() if c > 1),
        "extra_rows": sum(c - 1 for c in ids.values()),
        "tables": {t: stats[t] for t in ("events", "errors", "policy_state")},
        "err": stats["err"],
    }


def log(name: str, obj) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(obj, ensure_ascii=False, default=str)
    print(line, flush=True)
    with open(LOG_DIR / f"{name}.jsonl", "a", encoding="utf-8") as f:
        f.write(line + "\n")
