"""UC 41: CC_GOVERNANCE_DISABLE で収集とお知らせだけが止まり、外すと再開するかを実物で見る。

使い方: CC_E2E_RUN=a <worktree>/.venv/bin/python tmp/e2e-load-testing/uc-41-collect-disable/run.py

Route A: シェルの環境変数（extra_env）で値の種類（1・true・0・空）ごとの効き方を見る。
Route B: 利用者が自分の settings.json の env に直接書いた場合（policy.py の配布ではない）でも
         hook まで届くか、policy の適用がその項目を書き消さないかを見る。
すべて未認証（claude -p ok、未ログインで SessionStart は発火する）。
"""

import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
WT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WT / "e2e"))
BASE = tempfile.mkdtemp(prefix="cc-e2e-a-41-", dir=tempfile.gettempdir())
tempfile.tempdir = BASE  # E2ERoot をこの下に作らせる

from _flow import data_dir, install, ok, session  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import MARKETPLACE, PLUGIN_ID, publish, version  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402

LOG = WT.parent.parent / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-41-collect-disable"
LOG.mkdir(parents=True, exist_ok=True)
AUTO = f"extraKnownMarketplaces.{MARKETPLACE}.autoUpdate"
NOTICE = json.loads((WT / "e2e/samples/notices.json").read_bytes())
FAILS: list = []


def check(tag: str, cond: bool, msg: str) -> None:
    if not cond:
        FAILS.append(f"{tag}: {msg}")
        print(f"  !! FAIL {tag}: {msg}")


def policy_src(set_: dict) -> bytes:
    s = {AUTO: True, **set_}
    return (
        "from typing import Any\n"
        f"SET: dict[str, Any] = {s!r}\n"
        "ADD: dict[str, list] = {}\nREMOVE: dict[str, list] = {}\nONCE: dict[str, Any] = {}\n"
    ).encode()


def one_session(root, label, seen, extra_env=None) -> dict:
    """1 セッション起動し、新規行と systemMessage をまとめて返す。"""
    lines = session(root, extra_env)
    outs = [
        json.loads(e["output"])
        for e in lines
        if e.get("subtype") == "hook_response" and e.get("hook_event") == "SessionStart"
    ]
    assert len(outs) == 1, lines
    rows = [r for r in hook_rows(data_dir(root)) if r["event_id"] not in seen]
    seen |= {r["event_id"] for r in rows}
    kinds = sorted({r["kind"] for r in rows})
    msg = outs[0].get("systemMessage")
    entry = {
        "label": label, "extra_env": extra_env, "kinds": kinds,
        "n_rows": len(rows), "systemMessage": msg,
        "errors": [r["error_type"] for r in rows if r["kind"] == "error"],
    }  # fmt: skip
    print(f"  [{label}] extra_env={extra_env} kinds={kinds} n={len(rows)} "
          f"notice_shown={bool(msg)} errors={entry['errors']}")
    return entry


def statusline_mtime(root) -> float:
    p = root.config / "governance" / "statusline.js"
    return p.stat().st_mtime_ns if p.is_file() else -1


def route_a() -> list:
    """シェル環境変数。値の種類ごとに、収集とお知らせだけが止まるか・resume で漏れないかを見る。"""
    print("== Route A: シェルの環境変数 ==")
    log: list = []
    root = E2ERoot()
    git = GitHttpServer(root.srv)
    seen: set = set()
    try:
        install(root, git, version(1), {"hooks/policy.py": policy_src({}), "notices.json": json.dumps(NOTICE).encode()})

        e = one_session(root, "A0 baseline（無効化なし）", seen)
        log.append(e)
        check("A0", "event" in e["kinds"] and "policy" in e["kinds"], "baseline で event・policy 行が無い")
        check("A0", bool(e["systemMessage"]) and NOTICE[0]["title"] in e["systemMessage"], "baseline でお知らせが出ない")
        mtime0 = statusline_mtime(root)
        check("A0", mtime0 > 0, "statusline.js が同期されていない")

        for val, label in [("1", "A1 disable=1"), ("true", "A2 disable=true"), ("0", "A3 disable=0")]:
            e = one_session(root, label, seen, {"CC_GOVERNANCE_DISABLE": val})
            log.append(e)
            check(label, e["kinds"] == ["policy"], f"disable={val!r} でも event/error 行が出た: {e['kinds']}")
            check(label, not e["systemMessage"], f"disable={val!r} でもお知らせが出た")
            check(label, not e["errors"], f"disable={val!r} で error 行が出た")

        mtime1 = statusline_mtime(root)
        check("A-status", mtime1 == mtime0 or mtime1 > 0, "無効化中に statusline.js が消えた")

        e = one_session(root, "A4 disable=''（空・再開）", seen, {"CC_GOVERNANCE_DISABLE": ""})
        log.append(e)
        check("A4", "event" in e["kinds"], "空文字では再開しない（収集が戻らない）")
        check("A4", bool(e["systemMessage"]) and NOTICE[0]["title"] in e["systemMessage"],
              "再開後、無効化中に取りこぼした見本のお知らせが出ない")
        check("A4", not e["errors"], "再開直後に error 行が出た")

        # claude -p は headless なので、_mark_seen_and_open が早期 return し seen.json を書かない
        # （docs/guide/e2e.md「お知らせ」節・test_notices.py で既知）。-p だけの本 UC では「既読」化までは
        # 確かめられない。ここは再開後 2 回目も同じお知らせが出ることの確認（劣化していないことの確認）。
        e = one_session(root, "A5 再開後2回目（-p では既読にならない想定）", seen)
        log.append(e)
        check("A5", bool(e["systemMessage"]), "-p の既知の仕様に反し、2 回目でお知らせが消えた（想定外）")
        check("A5", not (root.config / "plugins" / "data").exists()
              or not list((root.config / "plugins" / "data").rglob("seen.json")),
              "-p でも seen.json ができた（既知の仕様から外れた）")

        total_event_rows = sum(1 for r in hook_rows(data_dir(root)) if r["kind"] == "event")
        n_event_sessions = 2  # A0 と A4
        check("A-leak", total_event_rows >= n_event_sessions,
              "無効化していたはずの区間から event 行が紛れ込んでいない可能性の確認に使う指標がおかしい")
    finally:
        git.close()
        root.cleanup()
    return log


def route_b() -> list:
    """利用者が自分の settings.json の env に直接書いた場合（policy 配布ではない）。"""
    print("== Route B: 利用者の settings.json の env（policy 配布ではない） ==")
    log: list = []
    root = E2ERoot()
    git = GitHttpServer(root.srv)
    seen: set = set()
    try:
        install(root, git, version(1), {"hooks/policy.py": policy_src({}), "notices.json": json.dumps(NOTICE).encode()})
        # まず baseline を 1 回流して、apply_settings が env ブロックを一度作る状態にする
        one_session(root, "B0 baseline", seen)

        def add_disable(data: dict) -> None:
            data.setdefault("env", {})["CC_GOVERNANCE_DISABLE"] = "1"

        p = root.config / "settings.json"
        data = json.loads(p.read_text(encoding="utf-8"))
        add_disable(data)
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        e = one_session(root, "B1 settings.json に env.CC_GOVERNANCE_DISABLE=1 を直書き（shell env なし）", seen)
        log.append(e)
        check("B1", e["kinds"] == ["policy"], f"settings.json 経由の disable が hook に届いていない: {e['kinds']}")
        check("B1", not e["systemMessage"], "settings.json 経由の disable でもお知らせが出た")

        after = json.loads(p.read_text(encoding="utf-8"))
        check("B1-keep", after.get("env", {}).get("CC_GOVERNANCE_DISABLE") == "1",
              "policy の適用が、利用者が書いた env.CC_GOVERNANCE_DISABLE を書き消した")

        data = json.loads(p.read_text(encoding="utf-8"))
        del data["env"]["CC_GOVERNANCE_DISABLE"]
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        e = one_session(root, "B2 settings.json から disable キーを消して再開", seen)
        log.append(e)
        check("B2", "event" in e["kinds"], "settings.json から消しても再開しない")
    finally:
        git.close()
        root.cleanup()
    return log


def main() -> None:
    log_a = route_a()
    log_b = route_b()
    (LOG / "route_a.json").write_text(json.dumps(log_a, ensure_ascii=False, indent=2), encoding="utf-8")
    (LOG / "route_b.json").write_text(json.dumps(log_b, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    if FAILS:
        print(f"FAIL ({len(FAILS)} 件):")
        for f in FAILS:
            print(" -", f)
        sys.exit(1)
    print("PASS: 全チェックを満たした")


if __name__ == "__main__":
    main()
