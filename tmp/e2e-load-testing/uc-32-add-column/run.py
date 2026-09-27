"""UC32: 列の追加を既存 DB で通し、順序を誤ったときの止まり方を記録する。

UC32_WORK（作業コピー。plugin/・server/ が新版、plugin.old/・server.old/ が旧版）を基準に e2e の部品を使う。
UC32_REAL=1 なら、新サーバに対して実セッション（claude -p）を 1 回動かす。
"""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

WORK = Path(os.environ["UC32_WORK"]).resolve()
sys.path.insert(0, str(WORK / "e2e"))

from _quiet import wait_quiet
from _root import E2ERoot
from _server import _DB, BASE_PATH, LABEL, DockerServer, docker

LOG = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-32-add-column"
)
FIXTURES = WORK / "tests" / "fixtures" / "hook_inputs"
COL = "duration_ms"
SESSION = ("SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolUse",
           "PostToolUse", "PostToolUseFailure", "Stop")  # fmt: skip
_Q = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);"
    "cols=[r[1] for r in c.execute('PRAGMA table_info(events)')];"
    "sel='event_id,hook_event'+(',duration_ms,typeof(duration_ms)' if 'duration_ms' in cols else '');"
    "print(json.dumps({'cols':[(r[1],r[2]) for r in c.execute('PRAGMA table_info(events)')],"
    "'rows':c.execute('select '+sel+' from events').fetchall()}))"
)
RESULT: dict = {}


def log(key: str, value) -> None:
    RESULT[key] = value
    print(f"== {key}: {json.dumps(value, ensure_ascii=False)[:1500]}", flush=True)


class Server(DockerServer):
    """イメージを共有し、起動前に DB ファイルを差し込めるサーバ。"""

    def __init__(self, root: E2ERoot, image: str, label: str) -> None:
        super().__init__(root, label)
        self.image = image

    def start_with(self, db: Path = None) -> None:
        env = {"DB_DSN": f"sqlite:///{_DB}", "INGEST_TOKEN": self.token, "CSV_DIR": "/app/data/csv",
               "PKG_PROXY": "", "ADMIN_PATH": self._admin, "ADMIN_PASSWORD": self._password,
               "BASE_PATH": BASE_PATH}  # fmt: skip
        secret = self._secret_dir / "data" / "secrets" / "cc-governance-server.env"
        secret.parent.mkdir(parents=True)
        secret.write_text("".join(f"{k}={v}\n" for k, v in env.items()), "utf-8")
        docker("create", "--name", self.name, "--label", LABEL, "-p", "127.0.0.1::5000/tcp", self.image)
        docker("cp", str(self._secret_dir / "data"), f"{self.name}:/mnt")
        if db is not None:
            docker("cp", str(db), f"{self.name}:{_DB}")
        docker("start", self.name)

    def wait_exit(self, timeout: float = 180) -> tuple:
        """(終了コード or None, 経過秒, ログの末尾)。待受を始めたら None。"""
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            code = self.exit_code()
            if code is not None:
                return code, round(time.monotonic() - t0, 1), self.logs()[-1500:]
            try:
                self.wait_ready()
                return None, round(time.monotonic() - t0, 1), ""
            except RuntimeError:
                continue
        raise TimeoutError(self.logs())

    def dump(self) -> dict:
        return json.loads(docker("exec", self.name, "python3", "-c", _Q, _DB).stdout)

    def stop_and_take_db(self, dest: Path) -> Path:
        docker("stop", self.name)
        docker("cp", f"{self.name}:{_DB}", str(dest))
        return dest

    def close(self) -> None:
        docker("rm", "-f", "-v", self.name, check=False)


class Terminal:
    """プラグインの hooks を実採取の stdin で直接起動し、_sender.py で同期送信する端末。"""

    def __init__(self, root: E2ERoot, src: Path, name: str, fx: dict) -> None:
        self.dir = root.tmp / f"term-{name}"
        self.plugin = self.dir / "plugin"
        shutil.copytree(src, self.plugin, ignore=shutil.ignore_patterns("__pycache__"))
        self.data = self.dir / "data"
        self.data.mkdir()
        self.fx = fx
        self.root = root

    def point(self, srv: Server) -> None:
        cfg = json.loads((self.plugin / "config.json").read_text("utf-8"))
        cfg.update(ingest_url=f"http://127.0.0.1:{srv.port}{BASE_PATH}/ingest",
                   ingest_token=srv.token, timeout_sec=5)  # fmt: skip
        (self.plugin / "config.json").write_text(json.dumps(cfg), "utf-8")

    def env(self) -> dict:
        env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG") if k in os.environ}
        env.update(CLAUDE_PLUGIN_DATA=str(self.data), CLAUDE_PLUGIN_ROOT=str(self.plugin),
                   CLAUDE_CONFIG_DIR=str(self.dir / "config"), TMPDIR=str(self.root.tmp),
                   CC_GOVERNANCE_USER_EMAIL="uc32@example.invalid",
                   PYTHONPYCACHEPREFIX=str(self.root.pycache),
                   NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")  # fmt: skip
        return env

    def session(self) -> list:
        """1 セッション分の hook を起動し、キューに積まれた行を返す（送信はしない）。"""
        count: dict = {}
        for ev in SESSION:
            i = count[ev] = count.get(ev, -1) + 1
            raw = self.fx[ev][i % len(self.fx[ev])]
            res = subprocess.run(["python3", str(self.plugin / "hooks" / "collect.py"), ev], input=raw,
                                 env=self.env(), capture_output=True, timeout=30, check=False)  # fmt: skip
            assert res.returncode == 0 and not res.stderr, (ev, res.returncode, res.stderr)
        q = self.data / "queue.jsonl"
        return [json.loads(x) for x in q.read_text("utf-8").splitlines() if x] if q.exists() else []

    def send(self) -> dict:
        subprocess.run(["python3", str(self.plugin / "hooks" / "_sender.py")], env=self.env(),
                       capture_output=True, timeout=120, check=False)  # fmt: skip
        wait_quiet(self.data)
        spool = sorted((self.data / "spool").glob("*.jsonl")) if (self.data / "spool").exists() else []
        q = self.data / "queue.jsonl"
        return {"queue_left": q.exists() and bool(q.read_text("utf-8").strip()), "spool_files": len(spool)}


def load_fixtures() -> dict:
    out: dict = {}
    for f in sorted(FIXTURES.glob("*.json")):
        raw = f.read_bytes()
        out.setdefault(json.loads(raw).get("hook_event_name"), []).append(raw)
    return out


def alter(src: Path, dest: Path, sql: str) -> Path:
    shutil.copy(src, dest)
    c = sqlite3.connect(dest)
    c.execute(sql)
    c.commit()
    c.close()
    return dest


def build(root: E2ERoot, src: Path, tag: str) -> str:
    ctx = root.build / tag
    shutil.copytree(src, ctx, ignore=shutil.ignore_patterns(".git", ".venv", "__pycache__", "*.db"))
    image = f"{root.path.name}-{tag}".replace("_", "-").lower()
    docker("build", "-q", "--label", LABEL, "-t", image, str(ctx), timeout=600)
    return image


def summarize(sent: list, dump: dict) -> dict:
    """送った行の duration_ms（端末のキュー）と DB の値を突き合わせる。"""
    ids = {r["event_id"]: r for r in sent}
    got = [r for r in dump["rows"] if r[0] in ids]
    return {
        "sent": len(sent),
        "sent_with_key": sum(1 for r in sent if COL in r),
        "sent_nonnull": sum(1 for r in sent if r.get(COL) is not None),
        "in_db": len(got),
        "db": [r[1:] for r in got],
        "match": all(len(r) < 3 or r[2] == ids[r[0]].get(COL) for r in got),
    }


def main() -> None:
    root = E2ERoot()
    servers: list = []
    images: list = []
    try:
        fx = load_fixtures()
        old_img = build(root, WORK / "server.old", "old")
        new_img = build(root, WORK / "server", "new")
        images += [old_img, new_img]

        def server(image: str, label: str, db: Path = None) -> tuple:
            s = Server(root, image, label)
            servers.append(s)
            s.start_with(db)
            return s, s.wait_exit()

        # 0. 旧サーバ + 旧端末で既存 DB を作る
        s0, st = server(old_img, "s0")
        log("0_old_server_start", st[:2])
        t_old = Terminal(root, WORK / "plugin.old", "old", fx)
        t_old.point(s0)
        rows = t_old.session()
        log("0_old_terminal_send", t_old.send())
        log("0_db", summarize(rows, s0.dump()))
        d0 = s0.stop_and_take_db(root.tmp / "d0.db")

        # b. ALTER を忘れて新サーバを起動（No.72）
        _, st = server(new_img, "b", alter(d0, root.tmp / "db-b.db", "select 1"))
        log("b_new_server_without_alter", st)

        # 本線: 手順どおり ALTER → 新サーバ → 新端末
        d1 = alter(d0, root.tmp / "d1.db", f"ALTER TABLE events ADD COLUMN {COL} INTEGER")
        s1, st = server(new_img, "main", d1)
        log("main_new_server_start", st[:2])
        t_new = Terminal(root, WORK / "plugin", "new", fx)
        t_new.point(s1)
        rows = t_new.session()
        log("main_new_terminal_send", t_new.send())
        dump = s1.dump()
        log("main_cols_tail", dump["cols"][-3:])
        log("main_db", summarize(rows, dump))
        log("main_old_rows_null", [r[1:] for r in dump["rows"] if r[2] is not None and r[0] not in {x["event_id"] for x in rows}])

        # c. サーバだけ新しく端末が古い
        t_old2 = Terminal(root, WORK / "plugin.old", "old2", fx)
        t_old2.point(s1)
        rows = t_old2.session()
        log("c_old_terminal_send", t_old2.send())
        log("c_db", summarize(rows, s1.dump()))

        if os.environ.get("UC32_REAL") == "1":
            real_session(root, s1)

        # d. 端末だけ新しくサーバが古い（= 同期忘れのサーバ。複製は旧いままハッシュと一致する）
        s4, st = server(old_img, "d", alter(d0, root.tmp / "db-d.db", "select 1"))
        log("d_old_server_start", st[:2])
        t_new2 = Terminal(root, WORK / "plugin", "new2", fx)
        t_new2.point(s4)
        rows = t_new2.session()
        body = (json.dumps(rows[2]) + "\n").encode()  # PostToolUse の 1 行をそのまま再送して応答を見る
        log("d_direct_post", s4.request("POST", BASE_PATH + "/ingest", body, {"X-Ingest-Token": s4.token})[:2])
        log("d_new_terminal_send", t_new2.send())
        log("d_db", summarize(rows, s4.dump()))
        log("d_server_log_tail", s4.logs()[-600:])

        # e. 型を誤った ALTER
        s5, st = server(new_img, "e", alter(d0, root.tmp / "db-e.db", f"ALTER TABLE events ADD COLUMN {COL} VARCHAR(255)"))
        log("e_new_server_start", st[:2])
        t_new3 = Terminal(root, WORK / "plugin", "new3", fx)
        t_new3.point(s5)
        rows = t_new3.session()
        log("e_new_terminal_send", t_new3.send())
        dump = s5.dump()
        log("e_cols_tail", dump["cols"][-2:])
        log("e_db", summarize(rows, dump))
        cmp = ("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);"
               "print(c.execute('select count(*),sum(duration_ms>1000),max(duration_ms),sum(duration_ms) "
               "from events where duration_ms is not null').fetchone())")  # fmt: skip
        log("e_query_semantics", docker("exec", s5.name, "python3", "-c", cmp, _DB).stdout.strip())
        s1_cmp = docker("exec", s1.name, "python3", "-c", cmp, _DB).stdout.strip()
        log("main_query_semantics_same_data", s1_cmp)

        # e2. 列名を誤った ALTER・表を誤った ALTER
        _, st = server(new_img, "e2", alter(d0, root.tmp / "db-e2.db", "ALTER TABLE events ADD COLUMN duration_msec INTEGER"))
        log("e2_typo_column", st)
        _, st = server(new_img, "e3", alter(d0, root.tmp / "db-e3.db", f"ALTER TABLE errors ADD COLUMN {COL} INTEGER"))
        log("e3_wrong_table", st)
    finally:
        for s in servers:
            s.close()
        for img in images:
            docker("image", "rm", img, check=False)
        (LOG / "result.json").write_text(json.dumps(RESULT, ensure_ascii=False, indent=1), "utf-8")
        root.cleanup()


def real_session(root: E2ERoot, srv: Server) -> None:
    """新サーバへ、新プラグインを導入した実セッションを 1 回送る。"""
    from _flow import ask, ingest_config, install
    from _githttp import GitHttpServer
    from _market import version

    before = {r[0] for r in srv.dump()["rows"]}
    git = GitHttpServer(root.srv)
    try:
        install(root, git, version(1), ingest_config(srv.port, srv.token))
        prompt = "Run the Bash command `echo uc32-ok` once, then reply done."
        t0 = time.monotonic()
        ask(root, prompt, model="haiku", tools=("Bash(echo:*)",))
        root.wait_quiet()
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            new = [r[1:] for r in srv.dump()["rows"] if r[0] not in before]
            if any(r[0] == "Stop" for r in new):
                break
            time.sleep(2)
        log("real_elapsed_sec", round(time.monotonic() - t0, 1))
        log("real_db_new_rows", new)
    finally:
        git.close()


if __name__ == "__main__":
    main()
