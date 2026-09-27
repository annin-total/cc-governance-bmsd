"""UC 06: REMOVE・SET の None・ロールバックで、端末の settings.json から本当に消えるかを実物で見る。

使い方: CC_E2E_RUN=a .venv/bin/python tmp/e2e-load-testing/uc-06-policy-revoke/scenarios.py [A B C D ...] > <.local のログ>
すべて未ログインの `claude -p` で SessionStart を発火させる（設定の適用に認証は要らない）。
"""

import json
import sys
from pathlib import Path

from uc06_lib import (
    MARKETPLACE,
    PLUGIN_ID,
    edit_settings,
    env,
    install,
    installed_version,
    new_rows,
    ov,
    policy_src,
    publish,
    real_leaks,
    session,
    settings,
    upgrade,
    version,
)

V1, V2, V3, V4 = (version(n) for n in (1, 2, 3, 4))
R1, R2, R3, R9 = "Read(./cc-e2e-r1)", "Read(./cc-e2e-r2)", "Read(./cc-e2e-r3)", "Read(./cc-e2e-r9)"
USER_RULE = "Bash(cc-e2e-user:*)"
RESULTS: dict = {}
FAILS: list = []


def check(sc: str, name: str, cond: bool, got=None) -> None:
    RESULTS.setdefault(sc, {"checks": [], "log": []})["checks"].append(
        {"name": name, "ok": bool(cond), "got": got}
    )
    if not cond:
        FAILS.append(f"{sc}: {name}: {got!r}")
    print(f"[{'OK' if cond else 'NG'}] {sc}: {name}" + ("" if cond else f"  got={got!r}"))


def log(sc: str, label: str, obj) -> None:
    RESULTS.setdefault(sc, {"checks": [], "log": []})["log"].append({label: obj})


def backups(root) -> int:
    d = root.config / "governance" / "backups"
    return len(list(d.iterdir())) if d.is_dir() else 0


def sc_a() -> None:
    """REMOVE（UC 6）: 配った要素だけ消え、利用者の要素・重複・別キーは残るか。行を消すだけでは残るか。"""
    sc = "A_remove"
    with env() as (root, srv):
        install(root, srv, V1, ov(policy_src(add={"permissions.deny": [R1, R2]})))

        def user(d: dict) -> None:
            d.setdefault("permissions", {})["deny"] = [USER_RULE]
            d["permissions"]["allow"] = ["Bash(ls)"]
            d["ccE2eUserKey"] = {"keep": 1}

        edit_settings(root, user)
        seen: set = set()
        session(root)
        s = settings(root)
        log(sc, "v1_rows", new_rows(root, seen))
        check(sc, "V1: ADD が利用者の要素の後ろに足される", s["permissions"]["deny"] == [USER_RULE, R1, R2], s["permissions"])
        edit_settings(root, lambda d: d["permissions"]["deny"].append(R1))  # 利用者が同じ要素を重ねて入れた
        upgrade(root, V2, policy_src(add={"permissions.deny": [R2]}, remove={"permissions.deny": [R1]}))
        check(sc, "V2 に更新された", installed_version(root) == [V2], installed_version(root))
        session(root)
        s = settings(root)
        rows = new_rows(root, seen)
        log(sc, "v2_rows", rows)
        check(sc, "V2: REMOVE で R1 が（重複も含め）消え、利用者の要素と R2 は残る", s["permissions"]["deny"] == [USER_RULE, R2], s["permissions"]["deny"])
        check(sc, "V2: 利用者の別キー（allow・独自キー）が残る", s["permissions"].get("allow") == ["Bash(ls)"] and s.get("ccE2eUserKey") == {"keep": 1}, s)
        rm = [r for r in rows if r["key_name"] == "remove:permissions.deny"]
        check(sc, "V2: remove 行が applied で value が消した要素", [(r["apply_result"], r["value"]) for r in rm] == [("applied", json.dumps([R1]))], rm)
        session(root)
        rows = new_rows(root, seen)
        check(sc, "V2 2 回目: remove 行は already_ok", {r["apply_result"] for r in rows if r["key_name"].startswith("remove:")} == {"already_ok"}, rows)
        upgrade(root, V3, policy_src())  # ADD・REMOVE の行を消しただけの版
        session(root)
        s = settings(root)
        log(sc, "v3_rows", new_rows(root, seen))
        check(sc, "V3（行を消すだけ）: R2 は端末に残る（仕様どおり）", s["permissions"]["deny"] == [USER_RULE, R2], s["permissions"]["deny"])


def sc_a3() -> None:
    """同じ要素を ADD と REMOVE の両方に書いた誤り: 毎回書き込み・バックアップが起きるか。"""
    sc = "A3_add_and_remove_same"
    with env() as (root, srv):
        install(root, srv, V1, ov(policy_src(add={"permissions.deny": [R3]}, remove={"permissions.deny": [R3]})))
        edit_settings(root, lambda d: d.setdefault("permissions", {}).__setitem__("deny", [USER_RULE]))
        seen: set = set()
        counts = []
        before = (root.config / "settings.json").read_bytes()
        for _ in range(3):
            session(root)
            rows = new_rows(root, seen)
            counts.append({"backups": backups(root), "results": sorted({(r["key_name"], r["apply_result"]) for r in rows if r["key_name"] != "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate"})})
        log(sc, "per_session", counts)
        after = settings(root)
        check(sc, "最終の deny は利用者の要素だけ", after["permissions"]["deny"] == [USER_RULE], after["permissions"])
        check(sc, "2 回目以降は書き込まない（バックアップが増えない）", counts[1]["backups"] == counts[2]["backups"], counts)
        log(sc, "settings_bytes_changed", before != (root.config / "settings.json").read_bytes())


def sc_b() -> None:
    """SET の None（UC 7）: 行を消すだけでは残り、None で消え、利用者の兄弟キーは残るか。"""
    sc = "B_set_none"
    with env() as (root, srv):
        keys = {"env.CC_E2E_REVOKE": "1", "includeCoAuthoredBy": False, "sandbox.enabled": False}
        install(root, srv, V1, ov(policy_src(set_=keys)))
        edit_settings(root, lambda d: d.setdefault("env", {}).__setitem__("CC_E2E_USER", "keep"))
        seen: set = set()
        session(root)
        s = settings(root)
        log(sc, "v1_rows", new_rows(root, seen))
        check(sc, "V1: 3 キーが入る", s.get("env", {}).get("CC_E2E_REVOKE") == "1" and s.get("includeCoAuthoredBy") is False and s.get("sandbox") == {"enabled": False}, s)
        upgrade(root, V2, policy_src())  # 行を消すだけ
        session(root)
        s = settings(root)
        log(sc, "v2_rows", new_rows(root, seen))
        check(sc, "V2（行を消すだけ）: 値は端末に残る（仕様どおり）", s.get("env", {}).get("CC_E2E_REVOKE") == "1" and "includeCoAuthoredBy" in s, s)
        upgrade(root, V3, policy_src(set_={k: None for k in keys}))
        session(root)
        s = settings(root)
        rows = new_rows(root, seen)
        log(sc, "v3_rows", rows)
        log(sc, "v3_settings", s)
        check(sc, "V3（None）: 3 キーとも消える", "CC_E2E_REVOKE" not in s.get("env", {}) and "includeCoAuthoredBy" not in s and "enabled" not in s.get("sandbox", {}), s)
        check(sc, "V3: 利用者の env.CC_E2E_USER は残る", s.get("env", {}).get("CC_E2E_USER") == "keep", s.get("env"))
        log(sc, "v3_empty_parent_left", {"sandbox" in s: s.get("sandbox")})
        got = {r["key_name"]: (r["value"], r["prev_value"], r["apply_result"]) for r in rows}
        check(sc, "V3: None の行は value=None・prev=旧値・applied", got.get("env.CC_E2E_REVOKE") == (None, "1", "applied"), got)
        session(root)
        rows = new_rows(root, seen)
        got = {r["key_name"]: (r["value"], r["prev_value"], r["apply_result"]) for r in rows}
        check(sc, "V3 2 回目: already_ok・prev=None", got.get("env.CC_E2E_REVOKE") == (None, None, "already_ok"), got)


def _c_setup(root, srv, seen: set) -> None:
    v1 = policy_src(set_={"env.CC_E2E_VAL": "v1"}, once={"env.CC_E2E_ONCE": "a"})
    install(root, srv, V1, ov(v1))
    session(root)
    new_rows(root, seen)
    upgrade(root, V2, policy_src(set_={"env.CC_E2E_VAL": "v2"}, once={"env.CC_E2E_ONCE": "b"}, add={"permissions.deny": [R9]}))
    session(root)
    new_rows(root, seen)
    s = settings(root)
    assert s["env"]["CC_E2E_VAL"] == "v2" and s["env"]["CC_E2E_ONCE"] == "b" and R9 in s["permissions"]["deny"], s
    edit_settings(root, lambda d: d["env"].__setitem__("CC_E2E_ONCE", "user"))  # 利用者が ONCE の値を変えた


def _c_after(sc: str, root, seen: set, expect_ver: str) -> None:
    session(root)
    s = settings(root)
    rows = new_rows(root, seen)
    log(sc, "rows", rows)
    log(sc, "once_json", json.loads((root.config / "governance" / "once.json").read_text()))
    check(sc, f"installed は {expect_ver}", installed_version(root) == [expect_ver], installed_version(root))
    check(sc, "SET は v1 に戻る", s["env"]["CC_E2E_VAL"] == "v1", s["env"])
    log(sc, "ONCE の値（利用者は user にしていた）", s["env"]["CC_E2E_ONCE"])
    log(sc, "V2 で ADD した R9 の残存", R9 in s.get("permissions", {}).get("deny", []))


def sc_c1() -> None:
    """ロールバック（UC 56）: 前の版の中身を、版番号も前に戻して配る（版を下げる）。"""
    sc = "C1_downgrade"
    with env() as (root, srv):
        seen: set = set()
        _c_setup(root, srv, seen)
        publish(root, V1, ov(policy_src(set_={"env.CC_E2E_VAL": "v1"}, once={"env.CC_E2E_ONCE": "a"})))
        res = []
        for args in (("plugin", "marketplace", "update", MARKETPLACE), ("plugin", "update", PLUGIN_ID)):
            r = root.run_claude(*args, timeout=120)
            res.append({"args": args, "rc": r.returncode, "out": (r.stdout + r.stderr)[-600:]})
        log(sc, "update_cli", res)
        print(json.dumps(res, ensure_ascii=False, indent=1))
        log(sc, "installed_after_update", installed_version(root))
        _c_after(sc, root, seen, V1)


def sc_c2() -> None:
    """ロールバック（UC 56）: 前の版の中身を、新しい版番号（V3）で配る（release.md の撤回）。"""
    sc = "C2_rollforward"
    with env() as (root, srv):
        seen: set = set()
        _c_setup(root, srv, seen)
        upgrade(root, V3, policy_src(set_={"env.CC_E2E_VAL": "v1"}, once={"env.CC_E2E_ONCE": "a"}))
        _c_after(sc, root, seen, V3)


SCENARIOS = {"A": sc_a, "A3": sc_a3, "B": sc_b, "C1": sc_c1, "C2": sc_c2}

if __name__ == "__main__":
    names = sys.argv[1:] or list(SCENARIOS)
    out = Path(sys.argv[0]).resolve().parents[5] / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-06-policy-revoke"
    for n in names:
        try:
            SCENARIOS[n]()
        except Exception as e:  # 1 つの失敗でほかのシナリオを止めない。記録して続ける
            check(n, "例外なく完走", False, repr(e)[-1500:])
    leaks = real_leaks()
    check("all", "本物の config に痕跡が無い", not leaks, leaks)
    (out / f"results-{'-'.join(names)}.json").write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1))
    print("FAILS:", json.dumps(FAILS, ensure_ascii=False, indent=1))
