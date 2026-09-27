"""UC 12: 例外を入れた policy.py の版へ更新し、設定の適用だけが止まり、お知らせ・収集・error 行の到達が続くかを実物で見る。

使い方: CC_E2E_RUN=a <worktree>/.venv/bin/python run.py [P0 P1 P2 P3 P4 P5]
未ログインの `claude -p`（SessionStart は発火する）。送信先は Docker の集計サーバ（e2e/_server.py）。
"""

import json
import os
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.dont_write_bytecode = True
WT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WT / "e2e"))
BASE = tempfile.mkdtemp(prefix="cc-e2e-a-12-", dir=tempfile.gettempdir())
tempfile.tempdir = BASE  # E2ERoot をこの下に作らせる

from _flow import data_dir, ingest_config, install, ok, session  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import MARKETPLACE, PLUGIN_ID, publish, version  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402
from _server import _DB, DockerServer, build_context, docker  # noqa: E402

LOG = WT.parent.parent / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-12-policy-exception"
SAMPLE = WT / "e2e" / "samples" / "notices.json"
NOTICE_TITLE = json.loads(SAMPLE.read_text(encoding="utf-8"))[0]["title"]
AC = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
AUTO = f"extraKnownMarketplaces.{MARKETPLACE}.autoUpdate"
HEAD = "from typing import Any\n"
TAIL = "ADD: dict[str, list] = {}\nREMOVE: dict[str, list] = {}\nONCE: dict[str, Any] = {}\n"


# 送信に成功した行は端末から消えるので、サーバの DB を ts の窓で読む（コンテナ内の python3）
_ROWS_SQL = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row;out=[]\n"
    "for t,k in (('events','event'),('policy_state','policy'),('errors','error')):\n"
    " out+=[dict(r,kind=k) for r in c.execute(f'SELECT * FROM {t} WHERE ts BETWEEN ? AND ?',"
    "(int(sys.argv[2]),int(sys.argv[3])))]\n"
    "print(json.dumps(out))"
)


def server_rows(srv: DockerServer, t0: int, t1: int) -> list:
    res = docker("exec", srv.name, "python3", "-c", _ROWS_SQL, _DB, str(t0), str(t1))
    return json.loads(res.stdout)


def good(ac: str) -> str:
    return HEAD + f"SET: dict[str, Any] = {{{AC!r}: {ac!r}, {AUTO!r}: True}}\n" + TAIL


# 名前 → (V2 の policy.py, 期待する error 行の error_type。None は error 行なし)
CASES = {
    # 陰性対照: 正しい版に対して「SyntaxError が出る」を期待し、判定が落ちることを確かめる
    "P0": (good("55"), "SyntaxError"),
    "P1": (HEAD + f"SET: dict[str, Any] = {{\n    {AC!r}: '55',\n" + TAIL, "SyntaxError"),
    "P2": ("import _no_such_policy_helper\n" + good("55"), "ModuleNotFoundError"),
    # コロンをカンマと書き違えると dict ではなく set になる
    "P3": (HEAD + f"SET: dict[str, Any] = {{{AC!r}, '55'}}\n" + TAIL, "AttributeError"),
    # list のつもりで set を書いた値。JSON に書けない
    "P4": (HEAD + f"SET: dict[str, Any] = {{{AC!r}: '60', {AUTO!r}: True, "
           "'permissions.deny': {'Bash(rm -rf:*)'}}\n" + TAIL, "TypeError"),  # fmt: skip
    # 境界: Exception でない例外。段ごとの except Exception を素通りする
    "P5": ("raise SystemExit(0)\n" + good("55"), None),
}


class Case:
    def __init__(self, name: str, srv: DockerServer) -> None:
        self.name = name
        self.srv = srv
        self.root = E2ERoot()
        self.git = GitHttpServer(self.root.srv)
        self.seen: set = set()
        self.log: list = []
        self.fails: list = []
        self.ov = {"notices.json": SAMPLE.read_bytes(), **ingest_config(srv.port, srv.token)}

    def check(self, tag: str, cond: bool, msg: str) -> None:
        if not cond:
            self.fails.append(f"{self.name} {tag}: {msg}")

    def pol(self, src: str) -> dict:
        return {**self.ov, "hooks/policy.py": src.encode()}

    def settings_bytes(self) -> bytes:
        return (self.root.config / "settings.json").read_bytes()

    def enabled(self) -> object:
        items = [p for p in self.root.plugin_list() if p.get("id") == PLUGIN_ID]
        return items[0].get("enabled") if items else "<absent>"

    def session(self, label: str) -> dict:
        # 毎回その場で送らせる（10 分の間引きを外す）。判定は端末に残った行とサーバの行の和で行う
        if self.seen:
            (data_dir(self.root) / "sent_at").unlink(missing_ok=True)
        t0 = int(time.time()) - 1
        lines = session(self.root)
        self.root.wait_quiet()
        remote = server_rows(self.srv, t0, int(time.time()) + 1)
        resp = [e for e in lines
                if e.get("subtype") == "hook_response" and e.get("hook_event") == "SessionStart"]  # fmt: skip
        outs = [e.get("output") for e in resp]
        merged = {r["event_id"]: r for r in remote + hook_rows(data_dir(self.root))}
        rows = [r for i, r in merged.items() if i not in self.seen]
        self.seen |= {r["event_id"] for r in rows}
        pol = [r for r in rows if r["kind"] == "policy"]
        entry = {
            "label": label, "hook_outputs": outs,
            "hook_meta": [{k: v for k, v in e.items() if k not in ("output", "session_id", "uuid")} for e in resp],
            "notice_shown": any(NOTICE_TITLE in (o or "") for o in outs),
            "errors": [(r["stage"], r["error_type"], r["plugin_version"]) for r in rows if r["kind"] == "error"],
            "policy": [(r["key_name"], r["value"], r["prev_value"], r["apply_result"]) for r in pol],
            "events": [r.get("hook_event") for r in rows if r["kind"] not in ("policy", "error")],
            "ids": {"error": [r["event_id"] for r in rows if r["kind"] == "error"],
                    "ss_event": [r["event_id"] for r in rows
                                 if r["kind"] not in ("policy", "error") and r.get("hook_event") == "SessionStart"]},
        }  # fmt: skip
        self.log.append(entry)
        print(f"[{self.name}:{label}] notice={entry['notice_shown']} errors={entry['errors']} "
              f"policy={[(p[0], p[3]) for p in entry['policy']]} events={entry['events']}")  # fmt: skip
        return entry

    def run(self, src: str, want_err) -> None:
        install(self.root, self.git, version(1), self.pol(good("60")))
        s = self.session("s1 V1 正しい版")
        self.check("s1", {p[3] for p in s["policy"]} == {"applied"}, f"V1 で適用される {s['policy']}")
        before = self.settings_bytes()
        publish(self.root, version(2), self.pol(src))
        ok(self.root, "plugin", "marketplace", "update", MARKETPLACE)
        ok(self.root, "plugin", "update", PLUGIN_ID)
        s = self.session("s2 V2 例外の版")
        want = [("apply_settings", want_err, version(2))] if want_err else []
        self.check("s2", s["errors"] == want, f"error 行 want={want} got={s['errors']}")
        self.check("s2", s["policy"] == [], f"policy 行が無い got={s['policy']}")
        self.check("s2", s["notice_shown"] == (want_err is not None or self.name == "P0"), "お知らせの表示")
        self.check("s2", len(s["ids"]["ss_event"]) == (1 if want_err or self.name == "P0" else 0),
                   "SessionStart の event 行")  # fmt: skip
        self.check("s2", self.settings_bytes() == before, "settings.json が変わらない")
        tmps = sorted(p.name for p in self.root.config.glob(".settings-*.tmp"))
        s["leftover_tmp"] = tmps
        self.check("s2", tmps == [], f"一時ファイルが残らない {tmps}")
        s["enabled"] = self.enabled()
        self.check("s2", s["enabled"] is True, f"プラグインは有効のまま {s['enabled']}")
        ids = set(s["ids"]["error"] + s["ids"]["ss_event"])
        try:
            self.srv.wait_event_ids(ids)
            s["delivered"] = True
        except TimeoutError as e:
            s["delivered"] = str(e)
            self.check("s2", False, f"サーバに届く {e}")
        publish(self.root, version(3), self.pol(good("50")))
        ok(self.root, "plugin", "marketplace", "update", MARKETPLACE)
        ok(self.root, "plugin", "update", PLUGIN_ID)
        s = self.session("s3 V3 直した版")
        self.check("s3", (AC, "50", "60", "applied") in s["policy"], f"直した版で追いつく {s['policy']}")
        self.check("s3", s["errors"] == [], f"error 行なし {s['errors']}")

    def close(self) -> None:
        (LOG / f"{self.name}.json").write_text(json.dumps(self.log, ensure_ascii=False, indent=2), "utf-8")
        self.git.close()
        self.root.cleanup()


def error_table(srv: DockerServer) -> str:
    _, body, _ = srv.request("GET", srv.admin_path("/"), auth=True)
    m = re.search(r'data-testid="error-summary".*?</table>', body, re.DOTALL)
    return m.group(0) if m else ""


def main() -> None:
    LOG.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or list(CASES)
    fails: list = []
    sroot = E2ERoot()
    srv = DockerServer(sroot, "uc12")
    try:
        srv.start(build_context(sroot, "uc12"))
        srv.wait_ready()
        for name in names:
            src, want = CASES[name]
            c = Case(name, srv)
            try:
                c.run(src, want)
            except Exception as e:  # noqa: BLE001 (1 件の失敗で残りを止めない。記録する)
                c.fails.append(f"{name} 例外: {type(e).__name__}: {e}")
            finally:
                c.close()
            if name == "P0":
                print(f"[P0 陰性対照] 落ちた数={len(c.fails)}（0 なら判定がゲートしていない）")
                if not c.fails:
                    fails.append("P0: 陰性対照が落ちなかった")
            else:
                fails += c.fails
        table = error_table(srv)
        (LOG / "error_table.html").write_text(table, "utf-8")
        for name in names:
            want = CASES[name][1]
            if name != "P0" and want and f"<td>apply_settings</td><td>{want}</td>" not in table:
                fails.append(f"{name}: 概況の表に apply_settings/{want} が無い")
        print(table)
    finally:
        srv.close()
        sroot.cleanup()
        shutil.rmtree(BASE, ignore_errors=True) if not os.listdir(BASE) else print(f"残った: {BASE}")
    print("FAILS:" if fails else "すべて期待どおり", *fails, sep="\n  ")


if __name__ == "__main__":
    main()
