"""UC 60: 撤去（disable・uninstall）と再導入で、端末に残るものと再導入後の振る舞いを実物で見る。

使い方: CC_E2E_RUN=a <worktree>/.venv/bin/python run.py [R1 R2 R3 R4]
認証は使わない（未ログインの `claude -p` でも SessionStart は発火する）。
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
WT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WT / "e2e"))
assert os.environ.get("CC_E2E_RUN") == "a", "CC_E2E_RUN=a を付けて動かす"
BASE = tempfile.mkdtemp(prefix="cc-e2e-a-60-", dir=tempfile.gettempdir())
tempfile.tempdir = BASE  # E2ERoot をこの下に作らせる

from _flow import install, ok  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import MARKETPLACE, PLUGIN_ID, PLUGIN_SRC, publish, version  # noqa: E402
from _root import REAL_CONFIG_DIRS, E2ERoot, hook_rows  # noqa: E402

LOG = WT.parent.parent / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-60-uninstall-reinstall"
V1 = version(1)
ONCE_K = "env.GOV_E2E_ONCE"
STATUSLINE = {"type": "command", "command": 'node "${GOVERNANCE_HOME}/statusline.js"'}
NOTICE_IDS = [n["id"] for n in json.loads((PLUGIN_SRC / "notices.json").read_text("utf-8"))]
SL_INPUT = {"model": {"display_name": "Opus"}, "context_window": {"used_percentage": 12.3}}
FAILS: list = []


def policy_src() -> dict:
    set_ = {
        "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60",
        f"extraKnownMarketplaces.{MARKETPLACE}.autoUpdate": True,
    }
    once = {"statusLine": STATUSLINE, ONCE_K: "a"}
    text = (
        "from typing import Any\n"
        f"SET: dict[str, Any] = {set_!r}\n"
        "ADD: dict[str, list] = {}\nREMOVE: dict[str, list] = {}\n"
        f"ONCE: dict[str, Any] = {once!r}\n"
    )
    return {"hooks/policy.py": text.encode()}


def check(label: str, cond: bool, detail) -> None:
    print(("ok   " if cond else "FAIL ") + label)
    if not cond:
        FAILS.append({"label": label, "detail": detail})


class Ctx:
    def __init__(self, name: str) -> None:
        self.name = name
        self.root = E2ERoot()
        self.git = GitHttpServer(self.root.srv)
        self.seen_ids: set = set()
        self.log: list = []

    @property
    def gov(self) -> Path:
        return self.root.config / "governance"

    def claude(self, *args: str) -> subprocess.CompletedProcess:
        return self.root.run_claude(*args, timeout=120)

    def settings(self):
        try:
            return self.root.json("settings.json")
        except FileNotFoundError:
            return None

    def edit(self, fn) -> None:
        p = self.root.config / "settings.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        fn(data)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def data_dirs(self) -> list:
        d = self.root.config / "plugins" / "data"
        return sorted(d.iterdir()) if d.is_dir() else []

    def snap(self, label: str) -> dict:
        gov = self.gov
        files = sorted(str(p.relative_to(gov)) for p in gov.rglob("*")) if gov.exists() else None
        cache = self.root.config / "plugins" / "cache" / MARKETPLACE
        s = {
            "label": label,
            "settings": self.settings(),
            "governance_files": files,
            "backups": len(list((gov / "backups").glob("settings-*.json"))) if gov.exists() else 0,
            "once_json": _read(gov / "once.json"),
            "data_dirs": {p.name: sorted(x.name for x in p.iterdir()) for p in self.data_dirs()},
            "cache": sorted(str(p.relative_to(cache)) for p in cache.rglob("*") if p.name.startswith(".") or p.parent.parent == cache) if cache.exists() else None,
            "installed": self.root.json("plugins/installed_plugins.json").get("plugins", {}),
            "known_marketplaces": sorted(_read_json(self.root.config / "plugins/known_marketplaces.json") or {}),
        }  # fmt: skip
        self.log.append({"snap": s})
        return s

    def session(self, label: str) -> dict:
        res = self.root.run_claude("-p", "ok", "--output-format", "stream-json", "--verbose", timeout=90)
        self.root.wait_quiet()
        lines = [json.loads(x) for x in res.stdout.splitlines() if x.strip().startswith("{")]
        outs = [
            e.get("output", "")
            for e in lines
            if e.get("subtype") == "hook_response" and e.get("hook_event") == "SessionStart"
        ]
        init = next((e for e in lines if e.get("subtype") == "init"), {})
        rows = []
        for d in self.data_dirs():
            rows += [r for r in hook_rows(d) if r["event_id"] not in self.seen_ids]
        self.seen_ids |= {r["event_id"] for r in rows}
        pol = {r["key_name"]: [r["value"], r["prev_value"], r["apply_result"]] for r in rows if r["kind"] == "policy"}
        entry = {
            "label": label, "rc": res.returncode,
            "hook_outputs": len(outs),
            "system_message": any("systemMessage" in o for o in outs),
            "plugins_in_init": [p.get("name") for p in init.get("plugins", [])],
            "kinds": sorted({r["kind"] for r in rows}), "n_rows": len(rows), "policy": pol,
            "errors": [r for r in rows if r["kind"] == "error"],
        }  # fmt: skip
        self.log.append({"session": entry})
        print(f"  [{self.name}] {label}: {json.dumps(entry, ensure_ascii=False)[:400]}")
        return entry

    def statusline(self, label: str) -> dict:
        """settings.json の statusLine.command を、本体と同じくシェル経由で実行する。"""
        sl = (self.settings() or {}).get("statusLine")
        if not isinstance(sl, dict):
            entry = {"label": label, "statusLine": sl}
        else:
            inp = dict(SL_INPUT, workspace={"current_dir": str(self.root.project)})
            p = subprocess.run(
                ["/bin/sh", "-c", sl["command"]], input=json.dumps(inp), capture_output=True,
                text=True, env=self.root.env(), cwd=self.root.project, timeout=30,
            )  # fmt: skip
            entry = {"label": label, "command": sl["command"], "rc": p.returncode,
                     "stdout": p.stdout, "stderr": p.stderr[-600:]}  # fmt: skip
        self.log.append({"statusline": entry})
        print(f"  [{self.name}] statusline {label}: rc={entry.get('rc')} out={entry.get('stdout', '')!r} err={entry.get('stderr', '')[:120]!r}")
        return entry

    def doctor(self, label: str) -> dict:
        res = self.claude("doctor")
        text = res.stdout + res.stderr
        i = text.find("Invalid settings")
        entry = {"label": label, "rc": res.returncode, "invalid": text[i : i + 600] if i >= 0 else None}
        self.log.append({"doctor": entry})
        print(f"  [{self.name}] doctor {label}: {entry}")
        return entry

    def run_ok(self, *args: str) -> str:
        res = self.claude(*args)
        self.log.append({"cmd": list(args), "rc": res.returncode, "out": (res.stdout + res.stderr)[-500:]})
        assert res.returncode == 0, res.stdout + res.stderr
        return res.stdout

    def mark_seen(self) -> None:
        """対話起動で読んだ状態を模す（-p は既読を書かないため）。"""
        (d,) = self.data_dirs()
        (d / "seen.json").write_text(json.dumps(NOTICE_IDS), encoding="utf-8")

    def close(self) -> None:
        (LOG / f"{self.name}.json").write_text(json.dumps(self.log, ensure_ascii=False, indent=1, default=str))
        self.git.close()
        self.root.cleanup()


def _read(p: Path):
    try:
        return p.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def _read_json(p: Path):
    t = _read(p)
    return json.loads(t) if t else None


def _uninstall(c: Ctx, *extra: str) -> None:
    c.run_ok("plugin", "uninstall", PLUGIN_ID, "--scope", "user", *extra)


def _reinstall(c: Ctx) -> None:
    c.run_ok("plugin", "install", PLUGIN_ID, "--scope", "user")


def r1() -> None:
    """既定の uninstall → 同じ版の再導入。disable / enable も通る。"""
    c = Ctx("R1")
    try:
        install(c.root, c.git, V1, policy_src())
        s1 = c.session("s1 導入直後")
        check("R1 s1 お知らせが出る", s1["system_message"], s1)
        a = c.snap("A 導入後")
        c.mark_seen()
        s2 = c.session("s2 既読の後")
        check("R1 s2 既読でお知らせが出ない", not s2["system_message"], s2)
        sl = c.statusline("導入中")
        check("R1 導入中の statusLine は rc 0 で表示あり", sl.get("rc") == 0 and sl.get("stdout"), sl)

        c.run_ok("plugin", "disable", PLUGIN_ID, "--scope", "user")
        c.snap("B disable 後")
        s3 = c.session("s3 disable 中")
        check("R1 s3 disable 中は hook が動かない", s3["n_rows"] == 0 and s3["hook_outputs"] == 0, s3)
        c.statusline("disable 中")
        c.run_ok("plugin", "enable", PLUGIN_ID, "--scope", "user")
        s4 = c.session("s4 enable 後")
        check("R1 s4 enable で再開し既読は残る", s4["n_rows"] > 0 and not s4["system_message"], s4)

        c.edit(lambda d: d["env"].__setitem__("GOV_E2E_ONCE", "user"))
        _uninstall(c)
        b = c.snap("C uninstall 後")
        check("R1 uninstall で settings.json は enabledPlugins 以外変わらない",
              {k: v for k, v in (b["settings"] or {}).items() if k != "enabledPlugins"}
              == {k: v for k, v in dict(a["settings"], env=dict(a["settings"]["env"], GOV_E2E_ONCE="user")).items() if k != "enabledPlugins"},
              [a["settings"], b["settings"]])  # fmt: skip
        s5 = c.session("s5 uninstall 後")
        check("R1 s5 uninstall 後は hook が動かない", s5["n_rows"] == 0 and s5["hook_outputs"] == 0, s5)
        sl = c.statusline("uninstall 後")
        check("R1 uninstall 後も statusLine は動く", sl.get("rc") == 0 and sl.get("stdout"), sl)
        moved = c.gov.with_name("governance.moved")
        c.gov.rename(moved)
        sl = c.statusline("governance/ を消した後")
        check("R1 governance/ 無しでは statusLine が失敗する", sl.get("rc") != 0, sl)
        moved.rename(c.gov)
        c.doctor("uninstall 後")

        _reinstall(c)
        c.snap("D 再導入後")
        s6 = c.session("s6 再導入後")
        check("R1 s6 再導入でお知らせが再表示される", s6["system_message"], s6)
        check("R1 s6 ONCE は書き直されない", s6["policy"].get(f"once:{ONCE_K}", [None, None, None])[2] == "already_ok"
              and c.settings()["env"]["GOV_E2E_ONCE"] == "user", [s6["policy"], c.settings()])  # fmt: skip
        c.snap("E 再導入のセッション後")
    finally:
        c.close()


def r2() -> None:
    """uninstall に続けてマーケットプレイスも外す。autoUpdate の項目が宙づりになるか。"""
    c = Ctx("R2")
    try:
        install(c.root, c.git, V1, policy_src())
        c.session("s1 導入直後")
        _uninstall(c)
        c.run_ok("plugin", "marketplace", "remove", MARKETPLACE)
        c.snap("A marketplace remove 後")
        c.doctor("marketplace remove 後")
        c.statusline("marketplace remove 後")
        c.run_ok("plugin", "marketplace", "add", c.git.url(MARKETPLACE), "--scope", "user")
        _reinstall(c)
        c.snap("B 再導入後")
        s = c.session("s2 再導入後")
        check("R2 s2 再導入後に hook が動く", s["n_rows"] > 0, s)
        c.snap("C 再導入のセッション後")
    finally:
        c.close()


def r3() -> None:
    """uninstall の後に利用者が governance/ と statusLine を片付け、自前の値にしてから入れ直す。"""
    c = Ctx("R3")
    try:
        install(c.root, c.git, V1, policy_src())
        c.session("s1 導入直後")
        _uninstall(c)
        shutil.rmtree(c.gov)
        c.edit(lambda d: (d.__setitem__("statusLine", {"type": "command", "command": "echo mine"}),
                          d["env"].__setitem__("GOV_E2E_ONCE", "user")))  # fmt: skip
        c.statusline("片付け後（自前）")
        _reinstall(c)
        s = c.session("s2 再導入後")
        st = c.settings()
        check("R3 s2 片付け後の再導入で ONCE が利用者の値を上書きする",
              s["policy"].get("once:statusLine", [0, 0, 0])[2] == "applied" and st["env"]["GOV_E2E_ONCE"] == "a",
              [s["policy"], st])  # fmt: skip
        c.snap("A 再導入のセッション後")
        c.statusline("再導入後")
    finally:
        c.close()


def r4() -> None:
    """uninstall --keep-data で既読が残るか。"""
    c = Ctx("R4")
    try:
        install(c.root, c.git, V1, policy_src())
        c.session("s1 導入直後")
        c.mark_seen()
        _uninstall(c, "--keep-data")
        c.snap("A uninstall --keep-data 後")
        _reinstall(c)
        s = c.session("s2 再導入後")
        check("R4 s2 --keep-data なら再表示されない", not s["system_message"], s)
        c.snap("B 再導入のセッション後")
    finally:
        c.close()


def real_leaks() -> list:
    found = []
    for d in REAL_CONFIG_DIRS:
        for rel in ("settings.json", "plugins/installed_plugins.json", "plugins/known_marketplaces.json"):
            t = _read(d / rel) or ""
            if "cc-e2e-a-60-" in t or "GOV_E2E_ONCE" in t:
                found.append(str(d / rel))
    return found


if __name__ == "__main__":
    LOG.mkdir(parents=True, exist_ok=True)
    names = sys.argv[1:] or ["R1", "R2", "R3", "R4"]
    try:
        for n in names:
            print(f"== {n}")
            try:
                {"R1": r1, "R2": r2, "R3": r3, "R4": r4}[n]()
            except Exception as e:  # 1 経路の失敗で他を止めない。記録して続ける
                FAILS.append({"label": f"{n} 例外", "detail": repr(e)[:2000]})
                print(f"EXC {n}: {e!r}"[:2000])
    finally:
        shutil.rmtree(BASE, ignore_errors=True)
    print("real_leaks:", real_leaks())
    print("FAILS:", json.dumps(FAILS, ensure_ascii=False, default=str)[:4000])
