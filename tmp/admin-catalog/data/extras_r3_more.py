"""第 3 弾で足す値（記録の側）: 利用状況の増減・利用者ごとの列・呼び出し先・途絶えた利用者・届き方・エラーの利用者数・欠けの状態。"""

from collections import Counter, defaultdict

import judge
from extras_r2 import _external

TOP = 3
WEEK = 7


def _pct(now, prev):
    return judge.change(now, prev)


def changes(p: dict) -> dict:
    """利用状況のカードの増減（率・差）。受信の増減は状態のページの窓（extras_r4.now_r3）。"""
    a, b, size, calls = p["x"]["active"], p["x"]["active_prev"], p["size"], p["calls"]
    out = {k: _pct(a[k], b[k]) for k in ("days_per_user", "prompts_per_person_day", "sessions_per_person_day")}
    out.update({f"{k}_calls": _pct(calls[k]["total"], calls[k]["prev"]) for k in calls})
    out["session_size"] = _pct(size["median"], size["prev"]["median"])
    out["autocompact_pt"] = None if size["auto_share"] is None or size["prev"]["auto_share"] is None else round(size["auto_share"] - size["prev"]["auto_share"], 1)
    out["bypass_diff"] = a["bypass_users"] - b["bypass_users"]
    return out


def activity_rows(raw, p: dict) -> None:
    """`user_use` の指示の前との差・増減率と、`user_calls` のよく使う外部ツール（上位 3 つ）。"""
    per = p["period"]
    prev = dict(raw.execute("SELECT user_email, COUNT(*) FROM events WHERE day BETWEEN ? AND ? AND hook_event = 'UserPromptSubmit' GROUP BY 1",
                            (per["prev_start"], per["prev_end"])))
    ext = defaultdict(Counter)
    for email, tool in raw.execute("SELECT user_email, tool_name FROM events WHERE day BETWEEN ? AND ? AND hook_event IN ('PostToolUse', 'PostToolUseFailure')"
                                   " AND (tool_name LIKE 'mcp__%' OR tool_name IN ('WebSearch', 'WebFetch'))", (per["start"], per["end"])):
        ext[email][_external(tool)[0]] += 1
    for r in p["x"]["activity"]:
        r["prompts_prev"] = prev.get(r["email"], 0)
        r["prompts_diff"] = r["prompts"] - r["prompts_prev"]
        r["prompts_change"] = _pct(r["prompts"], r["prompts_prev"])
        r["externals_top"] = [{"key": k, "calls": n} for k, n in ext[r["email"]].most_common(TOP)]
        r["externals_top_text"] = " · ".join(f"{t['key']} {t['calls']}" for t in r["externals_top"]) or None


def calls(raw, p: dict) -> list:
    """`calls` のタブ: スキル・コマンドと定義元の組・外部ツール（MCP はサーバごと）の 1 行ずつ。"""
    per = p["period"]
    acc: dict = {}

    def add(key, side, email):
        r = acc.setdefault(key, {"recent": 0, "prev": 0, "recent_users": set(), "prev_users": set()})
        r[side] += 1
        r[f"{side}_users"].add(email)

    sql = """SELECT day, user_email, hook_event, tool_name, skill_name, command_name, command_source FROM events
             WHERE day BETWEEN ? AND ? AND (skill_name IS NOT NULL OR command_name IS NOT NULL OR tool_name LIKE 'mcp__%' OR tool_name IN ('WebSearch', 'WebFetch'))"""
    for day, email, hook, tool, skill, command, source in raw.execute(sql, (per["prev_start"], per["end"])):
        side = "recent" if day >= per["start"] else "prev"
        if skill:
            add(("skill", skill, None), side, email)
        if command:
            add(("command", command, source), side, email)
        if hook in ("PostToolUse", "PostToolUseFailure") and _external(tool):
            add(("external", _external(tool)[0], None), side, email)
    rows = []
    for (kind, name, source), r in acc.items():
        diff = r["recent"] - r["prev"]
        trend = "up" if diff > 0 else "down" if diff < 0 else "flat"
        rows.append({"kind": kind, "name": name, "source": source, "recent_calls": r["recent"], "prev_calls": r["prev"], "calls_diff": diff,
                     "recent_users": len(r["recent_users"]), "users_diff": len(r["recent_users"]) - len(r["prev_users"]), "tags": [kind, trend]})
    return sorted(rows, key=lambda r: (-r["recent_calls"], r["kind"], r["name"]))


def _seen(raw, a: int, b: int) -> set:
    sql = "SELECT user_email FROM events WHERE day BETWEEN ? AND ? UNION SELECT user_email FROM policy_state WHERE day BETWEEN ? AND ?"
    return {u for (u,) in raw.execute(sql, (a, b, a, b))}


def silent(raw, today: int, csv_end: int) -> dict:
    """`went_silent`（前の 7 日に記録か設定の報告があり、直近の 7 日に無い人）と `user_delivery` の行。"""
    recent, prev, before = _seen(raw, today - WEEK + 1, today), _seen(raw, today - 2 * WEEK + 1, today - WEEK), _seen(raw, today - 3 * WEEK + 1, today - 2 * WEEK)
    gone, gone_prev = prev - recent, before - prev
    count = lambda a, b: dict(raw.execute("SELECT user_email, COUNT(*) FROM events WHERE day BETWEEN ? AND ? GROUP BY 1", (a, b)))  # noqa: E731
    now_n, prev_n = count(today - WEEK + 1, today), count(today - 2 * WEEK + 1, today - WEEK)
    last = dict(raw.execute("SELECT user_email, MAX(day) FROM events GROUP BY 1"))
    billed = {u for (u,) in raw.execute("SELECT DISTINCT user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (csv_end - WEEK + 1, csv_end))}
    rows = []
    for email in sorted(recent | prev):
        status = "silent" if email in gone else "ok"
        n, pn = now_n.get(email, 0), prev_n.get(email, 0)
        rows.append({"email": email, "status": status, "events": n, "events_prev": pn, "events_diff": n - pn, "per_day": round(n / WEEK, 1),
                     "last_day": last.get(email), "billed": email in billed, "tags": [status, "billed" if email in billed else "unbilled"]})
    rows.sort(key=lambda r: (r["status"] != "silent", -r["events"]))
    return {"users": len(gone), "prev": len(gone_prev), "delta": len(gone) - len(gone_prev), "rows": rows}


def errors(raw, p: dict) -> dict:
    """`errors` の行の端末数を利用者数に数え直し、件数の状態を「以上」で出す。"""
    per = p["period"]
    users = {(s, t): n for s, t, n in raw.execute("SELECT stage, error_type, COUNT(DISTINCT user_email) FROM errors WHERE day BETWEEN ? AND ? GROUP BY 1, 2",
                                                  (per["start"], per["end"]))}
    rows = [{k: v for k, v in r.items() if k != "terminals"} | {"users": users.get((r["stage"], r["error_type"]), 0)} for r in p["errors"]["rows"]]
    return {"rows": rows, "state": judge.over(p["errors"]["total"], judge.ERROR_COUNT_ELEVATED)}


def nulls(p: dict) -> dict:
    return {"state": judge.over(p["nulls"]["rate"], judge.NULL_RATE_ELEVATED, judge.NULL_RATE_HIGH)}
