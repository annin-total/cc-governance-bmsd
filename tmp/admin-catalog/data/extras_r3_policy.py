"""第 3 弾で足す値（設定の報告の側）: 利用者単位の適用状況・本体とプラグインの古い版・設定ごとの未適用の利用者。端末の区分を持たない。"""

import judge

POLICY_DAYS = 30
KINDS = ("core", "plugin")
STATUS_RANK = {"off": 0, "none": 1, "ok": 2}
MAX_DIST = 2  # バージョンの段階: 最新・1 つ前・2 つ以上前


def _ver(v: str) -> tuple:
    return tuple(int(x) if x.isdigit() else 0 for x in str(v).split("."))


def _oldest(raw, sql: str, a: int, b: int) -> dict:
    """端末ごとに最新の版、利用者ごとに最も古い版。"""
    latest: dict = {}
    for email, host, version, ts in raw.execute(sql, (a, b)):
        if (email, host) not in latest or ts > latest[(email, host)][1]:
            latest[(email, host)] = (version, ts)
    out: dict = {}
    for (email, _), (version, _) in latest.items():
        if email not in out or _ver(version) < _ver(out[email]):
            out[email] = version
    return out


def _versions(raw, today: int) -> dict:
    a = today - POLICY_DAYS + 1
    core = _oldest(raw, "SELECT user_email, host, claude_code_version, ts FROM events WHERE day BETWEEN ? AND ? AND claude_code_version IS NOT NULL", a, today)
    plugin = _oldest(raw, "SELECT user_email, host, plugin_version, ts FROM policy_state WHERE day BETWEEN ? AND ? AND plugin_version IS NOT NULL", a, today)
    return {"core": core, "plugin": plugin}


def _summary(kind: str, by_user: dict) -> dict:
    """古い版の人数（最新は窓の中で報告された最も新しい版）と、版ごとの [版, 人数, 最新からの距離（0・1・2 以上は 2）]。"""
    if not by_user:
        return {"latest": None, "outdated": 0, "total": 0, "parts": [], "rows": [], "state": judge.OK}
    latest = max(by_user.values(), key=_ver)
    counts: dict = {}
    for v in by_user.values():
        counts[v] = counts.get(v, 0) + 1
    order = sorted(counts, key=_ver, reverse=True)
    outdated = sum(n for v, n in counts.items() if v != latest)
    elevated = judge.CORE_OUTDATED_ELEVATED if kind == "core" else judge.PLUGIN_OUTDATED_ELEVATED
    return {"latest": latest, "outdated": outdated, "total": len(by_user), "parts": [[v, counts[v], min(i, MAX_DIST)] for i, v in enumerate(order)],
            "state": judge.over(outdated, elevated), "rows": [{"kind": kind, "version": v, "users": counts[v], "total": len(by_user),
                                                              "share": round(counts[v] / len(by_user) * 100, 1), "latest": v == latest,
                                                              "order": len(order) - i} for i, v in enumerate(order)]}


def build(raw, today: int, policy: dict) -> dict:
    """利用者ごとの行・数・版・設定ごとの未適用の人数。`policy` はサーバの適用状況の集計（端末ごとの行を含む）。"""
    vers = _versions(raw, today)
    summ = {k: _summary(k, vers[k]) for k in KINDS}
    rows = []
    for u in policy["users"]:
        status = "none" if u["day"] is None else "off" if u["off"] else "ok"
        core, plugin = vers["core"].get(u["email"]), vers["plugin"].get(u["email"])
        old = [k for k, v in (("core", core), ("plugin", plugin)) if v and v != summ[k]["latest"]]
        rows.append({"email": u["email"], "status": status, "off": u["off"], "on": u["on"], "core": core, "plugin": plugin,
                     "core_latest": core == summ["core"]["latest"], "plugin_latest": plugin == summ["plugin"]["latest"],
                     "old": bool(old), "day": u["day"], "ago": u["ago"], "late": False, "rank": STATUS_RANK[status] * 2 + (0 if old else 1),
                     "tags": [status] + (["old"] if old else [])})
    rows.sort(key=lambda r: (r["rank"], r["email"]))
    counts = {s: sum(r["status"] == s for r in rows) for s in STATUS_RANK}
    den = policy["denominator"]
    items = [{**i, "off_users": sum(1 for r in rows if r["on"].get(i["key"]) is False)} for i in policy["items"]]
    return {
        "users": rows, "items": items, "denominator": den, "basis": policy["basis"], "lowest": min(items, key=lambda i: i["rate"])["key"] if items else None,
        "counts": {**counts, "ok_rate": round(counts["ok"] / den * 100, 1) if den else None, "old": sum(r["old"] for r in rows)},
        "states": {"off": judge.over(counts["off"], None, judge.NON_COMPLIANT_USERS_HIGH), "none": judge.over(counts["none"], judge.NOT_INTRODUCED_ELEVATED)},
        "core": summ["core"], "plugin": summ["plugin"], "versions": summ["core"]["rows"] + summ["plugin"]["rows"],
    }
