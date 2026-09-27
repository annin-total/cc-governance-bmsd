"""UC 01: 旧版を導入→値を変えた新版へ更新し、settings.json と policy 行を実物で見る。

使い方: CC_E2E_RUN=a <worktree>/.venv/bin/python run.py [R1 R2 R3 gate]
認証は使わない（未ログインの `claude -p` でも SessionStart は発火する）。
"""

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
WT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WT / "e2e"))
BASE = tempfile.mkdtemp(prefix="cc-e2e-a-01-", dir=tempfile.gettempdir())
tempfile.tempdir = BASE  # E2ERoot をこの下に作らせる

from _flow import data_dir, install, ok  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import MARKETPLACE, PLUGIN_ID, publish, version  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402

LOG = WT.parent.parent / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-01-policy-update"
AC = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
AUTO = f"extraKnownMarketplaces.{MARKETPLACE}.autoUpdate"
ONCE_K = "env.GOV_E2E_ONCE"
V1, V2 = version(1), version(2)
FAILS: list = []


def policy_src(set_: dict, once: dict) -> dict:
    text = (
        "from typing import Any\n"
        f"SET: dict[str, Any] = {set_!r}\n"
        "ADD: dict[str, list] = {}\nREMOVE: dict[str, list] = {}\n"
        f"ONCE: dict[str, Any] = {once!r}\n"
    )
    return {"hooks/policy.py": text.encode()}


class Ctx:
    def __init__(self, name: str) -> None:
        self.name = name
        self.root = E2ERoot()
        self.git = GitHttpServer(self.root.srv)
        self.seen: set = set()
        self.log: list = []

    def settings(self) -> dict:
        return self.root.json("settings.json")

    def edit(self, fn) -> None:
        p = self.root.config / "settings.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        fn(data)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def update(self, ver: str, pol: dict) -> None:
        publish(self.root, ver, pol)
        ok(self.root, "plugin", "marketplace", "update", MARKETPLACE)
        ok(self.root, "plugin", "update", PLUGIN_ID)

    def session(self, label: str) -> dict:
        """1 セッション起動し、新しく増えた policy 行を key_name → 行で返す。"""
        res = self.root.run_claude("-p", "ok", timeout=90)
        self.root.wait_quiet()
        rows = [r for r in hook_rows(data_dir(self.root)) if r["event_id"] not in self.seen]
        self.seen |= {r["event_id"] for r in rows}
        pol = {r["key_name"]: r for r in rows if r["kind"] == "policy"}
        errs = [r for r in rows if r["kind"] == "error"]
        entry = {
            "label": label, "rc": res.returncode, "stderr_tail": res.stderr[-300:],
            "policy": {k: [r["value"], r["prev_value"], r["apply_result"], r["plugin_version"]]
                       for k, r in pol.items()},
            "errors": errs, "settings_env": self.settings().get("env"),
            "once_json": _read_once(self.root),
        }  # fmt: skip
        self.log.append(entry)
        print(f"[{self.name}:{label}] rc={res.returncode} errors={len(errs)}")
        for k, v in entry["policy"].items():
            print(f"    {k}: value={v[0]!r} prev={v[1]!r} result={v[2]} ver={v[3]}")
        return pol

    def close(self) -> None:
        (LOG / f"{self.name}.json").write_text(
            json.dumps(self.log, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        self.git.close()
        self.root.cleanup()


def _read_once(root) -> object:
    p = root.config / "governance" / "once.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None


def expect(tag: str, pol: dict, key: str, value, prev, result, ver=None) -> None:
    r = pol.get(key)
    got = None if r is None else (r["value"], r["prev_value"], r["apply_result"], r["plugin_version"])
    want = (value, prev, result, ver if ver else (got[3] if got else None))
    if got != want:
        FAILS.append(f"{tag} {key}: want={want} got={got}")


def check(tag: str, cond: bool, msg: str) -> None:
    if not cond:
        FAILS.append(f"{tag}: {msg}")


def _dig(d: dict, path: str):
    for s in path.split("."):
        if not isinstance(d, dict) or s not in d:
            return "<missing>"
        d = d[s]
    return d


def _put(d: dict, path: str, v) -> None:
    *head, last = path.split(".")
    for s in head:
        d = d.setdefault(s, {})
    d[last] = v


def route1() -> None:
    """SET の値の変更・利用者の型違い（env の int）・ONCE の差し替え（記録あり）。"""
    c = Ctx("R1")
    try:
        p1 = policy_src({AC: "60", AUTO: True}, {ONCE_K: "a"})
        p2 = policy_src({AC: "50", AUTO: True}, {ONCE_K: "b"})
        install(c.root, c.git, V1, p1)
        s = c.session("s1 V1 新規")
        expect("R1s1", s, AC, "60", None, "applied", V1)
        expect("R1s1", s, "once:" + ONCE_K, "a", None, "applied", V1)
        c.edit(lambda d: (_put(d, AC, 60), _put(d, ONCE_K, "user")))
        s = c.session("s2 V1 利用者が int 60・ONCE を変更")
        expect("R1s2", s, AC, "60", "60", "applied", V1)
        expect("R1s2", s, "once:" + ONCE_K, "a", "user", "already_ok", V1)
        check("R1s2", _dig(c.settings(), AC) == "60", "int 60 が文字列 60 に戻る")
        check("R1s2", _dig(c.settings(), ONCE_K) == "user", "ONCE が利用者の値を戻さない")
        n_backup = len(list((c.root.config / "governance" / "backups").iterdir()))
        c.update(V2, p2)
        check("R1up", len(list((c.root.config / "governance" / "backups").iterdir())) == n_backup,
              "plugin update は hook を走らせない（バックアップが増えない）")  # fmt: skip
        check("R1up", _dig(c.settings(), AC) == "60", "更新直後（セッション前）は旧値のまま")
        s = c.session("s3 V2 更新後の最初")
        expect("R1s3", s, AC, "50", "60", "applied", V2)
        expect("R1s3", s, "once:" + ONCE_K, "b", "user", "applied", V2)
        check("R1s3", _dig(c.settings(), AC) == "50", "新値 50 が書かれる")
        check("R1s3", c.log[-1]["once_json"] == [json.dumps([ONCE_K, "b"])], "once.json は新値の記録だけ")
        s = c.session("s4 V2 2 回目")
        check("R1s4", {r["apply_result"] for r in s.values()} == {"already_ok"}, "全部 already_ok")
        c.edit(lambda d: _put(d, ONCE_K, "user2"))
        s = c.session("s5 V2 利用者が再変更")
        expect("R1s5", s, "once:" + ONCE_K, "b", "user2", "already_ok", V2)
        check("R1s5", _dig(c.settings(), ONCE_K) == "user2", "ONCE は 2 回目を書かない")
    finally:
        c.close()


def route2() -> None:
    """事前に同値が在る端末、ONCE の記録が失われた端末の更新。"""
    c = Ctx("R2")
    try:
        p1 = policy_src({AC: "60", AUTO: True}, {ONCE_K: "a"})
        p2 = policy_src({AC: "50", AUTO: True}, {ONCE_K: "a"})
        install(c.root, c.git, V1, p1)
        c.edit(lambda d: (_put(d, AC, "60"), _put(d, ONCE_K, "a")))
        s = c.session("s1 V1 既存が同値（SET・ONCE とも）")
        expect("R2s1", s, AC, "60", "60", "already_ok", V1)
        expect("R2s1", s, "once:" + ONCE_K, "a", "a", "already_ok", V1)
        check("R2s1", c.log[-1]["once_json"] == [json.dumps([ONCE_K, "a"])], "同値でも記録する")
        c.edit(lambda d: _put(d, ONCE_K, "user"))
        (c.root.config / "governance" / "once.json").unlink()
        c.update(V2, p2)
        s = c.session("s2 V2 ONCE の記録喪失・値は据え置き")
        expect("R2s2", s, AC, "50", "60", "applied", V2)
        expect("R2s2", s, "once:" + ONCE_K, "a", "user", "applied", V2)
        check("R2s2", _dig(c.settings(), ONCE_K) == "a", "記録喪失で利用者の値を上書きする")
    finally:
        c.close()


def route3() -> None:
    """途中の型違い（env が文字列）の端末へ更新し、直した後に追いつくか。"""
    c = Ctx("R3")
    try:
        p1 = policy_src({AC: "60", AUTO: True}, {ONCE_K: "a"})
        p2 = policy_src({AC: "50", AUTO: True}, {ONCE_K: "b"})
        install(c.root, c.git, V1, p1)
        c.session("s1 V1")
        c.edit(lambda d: d.__setitem__("env", "broken"))
        c.update(V2, p2)
        s = c.session("s2 V2 env が文字列")
        # env が dict でないと Claude Code がプラグインを無効にし、hook 自体が動かない
        check("R3s2", s == {}, "hook が動かない（skipped_missing の経路には届かない）")
        check("R3s2", c.settings().get("env") == "broken", "壊れた env に触れない")
        c.edit(lambda d: d.__setitem__("env", {}))
        s = c.session("s3 V2 env を直した後")
        expect("R3s3", s, AC, "50", None, "applied", V2)
        expect("R3s3", s, "once:" + ONCE_K, "b", None, "applied", V2)
    finally:
        c.close()


def route4() -> None:
    """Claude Code の型検査に反する値を SET で配り、次の版で直せるか。"""
    c = Ctx("R4")
    try:
        install(c.root, c.git, V1, policy_src({AC: "60", AUTO: True}, {}))
        c.session("s1 V1")
        c.update(V2, policy_src({AC: "60", AUTO: True, "cleanupPeriodDays": "30"}, {}))
        s = c.session("s2 V2 型違いの値を配る")
        expect("R4s2", s, "cleanupPeriodDays", "30", None, "applied", V2)
        s = c.session("s3 V2 次のセッション")
        check("R4s3", s == {}, "hook が動かない（プラグインが無効になる）")
        c.log[-1]["plugin_list"] = c.root.plugin_list()
        V3 = version(3)
        c.update(V3, policy_src({AC: "60", AUTO: True, "cleanupPeriodDays": 30}, {}))
        c.log[-1]["plugin_list_after_v3"] = c.root.plugin_list()
        s = c.session("s4 V3 直した版へ更新")
        check("R4s4", s == {}, "直した版でも hook は動かない（自力で戻れない）")
    finally:
        c.close()


def gate() -> None:
    """判定がゲートしていることを、わざと違う期待値で落ちることで確かめる。"""
    fake = {AC: {"value": "50", "prev_value": "60", "apply_result": "applied", "plugin_version": V2}}
    before = len(FAILS)
    expect("gate", fake, AC, "50", "60", "applied", V2)
    assert len(FAILS) == before, "正しい期待値で落ちた"
    for wrong in (("60", "60", "applied", V2), ("50", None, "applied", V2),
                  ("50", "60", "already_ok", V2), ("50", "60", "applied", V1)):  # fmt: skip
        expect("gate", fake, AC, *wrong)
    expect("gate", {}, AC, "50", "60", "applied", V2)
    assert len(FAILS) == before + 5, FAILS[before:]
    del FAILS[before:]
    print("[gate] 違う期待値 5 通りすべてで不一致を検出した")


def main() -> None:
    LOG.mkdir(parents=True, exist_ok=True)
    routes = {"gate": gate, "R1": route1, "R2": route2, "R3": route3, "R4": route4}
    try:
        for name in sys.argv[1:] or list(routes):
            routes[name]()
    finally:
        shutil.rmtree(BASE, ignore_errors=True) if not os.listdir(BASE) else print(f"残った: {BASE}")
    print("FAILS:" if FAILS else "すべて期待どおり", *FAILS, sep="\n  ")


if __name__ == "__main__":
    main()
