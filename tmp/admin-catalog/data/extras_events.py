"""今の画面に無い指標（記録 = events の側）。7・28 日だけ数える（12 か月の記録の集計は重いため、今の仕様どおり出さない）。"""

from collections import Counter, defaultdict
from statistics import median

BYPASS = "bypassPermissions"
CONTEXT_BIN = 20000
JST = 9 * 3600
TOOL_EVENTS = ("PostToolUse", "PostToolUseFailure")


def rate(n, d):
    return None if not d else round(n / d * 100, 1)


def _pct(values: list, q: float):
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(len(s) * q))]


def _load(raw, a: int, b: int) -> list:
    sql = """SELECT day, ts, user_email, host, hook_event, session_id, tool_name, skill_name, command_name,
             permission_mode, effort_level, agent_id, is_interrupt, context_tokens, compact_trigger, claude_code_version
             FROM events WHERE day BETWEEN ? AND ?"""
    keys = ("day", "ts", "email", "host", "hook", "session", "tool", "skill", "command", "mode", "effort", "agent",
            "interrupt", "ctx", "trigger", "version")
    return [dict(zip(keys, r)) for r in raw.execute(sql, (a, b))]


def _per_user(rows: list) -> dict:
    u: dict = defaultdict(lambda: {"sessions": set(), "days": set(), "prompts": 0, "interrupts": 0, "tools": 0,
                                   "failures": 0, "skills": 0, "commands": 0, "agent": 0, "events": 0, "modes": 0,
                                   "bypass": 0, "compacts": 0, "version": None, "last_ts": 0})
    for r in rows:
        x = u[r["email"]]
        x["events"] += 1
        x["days"].add(r["day"])
        if r["session"]:
            x["sessions"].add(r["session"])
        x["prompts"] += r["hook"] == "UserPromptSubmit"
        x["interrupts"] += bool(r["interrupt"])
        x["tools"] += r["hook"] in TOOL_EVENTS
        x["failures"] += r["hook"] == "PostToolUseFailure"
        x["skills"] += bool(r["skill"])
        x["commands"] += bool(r["command"])
        x["agent"] += bool(r["agent"])
        x["compacts"] += r["hook"] == "PreCompact"
        if r["mode"]:
            x["modes"] += 1
            x["bypass"] += r["mode"] == BYPASS
        if r["version"] and r["ts"] >= x["last_ts"]:
            x["version"], x["last_ts"] = r["version"], r["ts"]
    return u


def _person(x: dict) -> dict:
    s = len(x["sessions"])
    return {"active_days": len(x["days"]), "sessions": s, "prompts": x["prompts"],
            "prompts_per_session": round(x["prompts"] / s, 1) if s else None,
            "interrupts": x["interrupts"], "interrupt_rate": rate(x["interrupts"], x["prompts"]),
            "tool_calls": x["tools"], "skills": x["skills"], "commands": x["commands"],
            "agent_rate": rate(x["agent"], x["events"]), "bypass_rate": rate(x["bypass"], x["modes"]),
            "compacts": x["compacts"], "version": x["version"], "last_day": max(x["days"])}


def _daily(rows: list, cost_days: dict, start: int, end: int, recent_start: int) -> list:
    by = defaultdict(lambda: {"users": set(), "sessions": set(), "prompts": 0, "skills": 0, "commands": 0,
                              "interrupts": 0, "tools": 0})
    for r in rows:
        d = by[r["day"]]
        d["users"].add(r["email"])
        if r["session"]:
            d["sessions"].add(r["session"])
        d["prompts"] += r["hook"] == "UserPromptSubmit"
        d["skills"] += bool(r["skill"])
        d["commands"] += bool(r["command"])
        d["interrupts"] += bool(r["interrupt"])
        d["tools"] += r["hook"] in TOOL_EVENTS
    out = []
    for day in range(start, end + 1):
        d = by[day]
        cost, cost_users = cost_days.get(day, (None, None))
        out.append({"day": day, "period": "recent" if day >= recent_start else "prev", "users": len(d["users"]),
                    "sessions": len(d["sessions"]), "prompts": d["prompts"], "skills": d["skills"],
                    "commands": d["commands"], "interrupts": d["interrupts"], "tool_calls": d["tools"],
                    "cost": cost, "cost_users": cost_users,
                    "cost_per_user": round(cost / cost_users, 2) if cost_users else None})
    return out


def _tools(rows: list) -> list:
    calls, fails, users = Counter(), Counter(), defaultdict(set)
    for r in rows:
        if r["hook"] in TOOL_EVENTS and r["tool"]:
            calls[r["tool"]] += 1
            fails[r["tool"]] += r["hook"] == "PostToolUseFailure"
            users[r["tool"]].add(r["email"])
    total = sum(calls.values())
    return [{"key": t, "calls": n, "failures": fails[t], "fail_rate": rate(fails[t], n), "users": len(users[t]),
             "share": rate(n, total)} for t, n in calls.most_common()]


def _context(rows: list, recent_start: int) -> list:
    bins: dict = defaultdict(lambda: {"prev": 0, "recent": 0})
    for r in rows:
        if r["hook"] == "Stop" and r["ctx"] is not None:
            bins[r["ctx"] // CONTEXT_BIN * CONTEXT_BIN]["recent" if r["day"] >= recent_start else "prev"] += 1
    tp = sum(b["prev"] for b in bins.values())
    tr = sum(b["recent"] for b in bins.values())
    return [{"bin": k, **v, "prev_share": rate(v["prev"], tp), "recent_share": rate(v["recent"], tr)}
            for k, v in sorted(bins.items())]


def _hours(rows: list) -> list:
    c = Counter((r["ts"] + JST) // 3600 % 24 for r in rows if r["hook"] == "UserPromptSubmit")
    total = sum(c.values())
    return [{"key": h, "prompts": c[h], "share": rate(c[h], total)} for h in range(24)]


def _active(rows: list, users: dict, days: int) -> dict:
    n = len(users)
    prompts = sum(x["prompts"] for x in users.values())
    sessions = sum(len(x["sessions"]) for x in users.values())
    person_days = sum(len(x["days"]) for x in users.values())
    stop = [r["ctx"] for r in rows if r["hook"] == "Stop" and r["ctx"] is not None]
    pre = [r for r in rows if r["hook"] == "PreCompact"]
    auto = sum(r["trigger"] == "auto" for r in pre)
    reach = {k: sum(1 for x in users.values() if x[k]) for k in ("skills", "commands", "agent", "bypass")}
    return {"users": n, "dau": round(sum(len(x["days"]) for x in users.values()) / days, 1),
            "days_per_user": round(person_days / n, 1) if n else None,
            "stickiness": rate(person_days / days, n), "sessions": sessions,
            "sessions_per_person_day": round(sessions / person_days, 2) if person_days else None,
            "prompts": prompts, "prompts_per_session": round(prompts / sessions, 1) if sessions else None,
            "prompts_per_person_day": round(prompts / person_days, 1) if person_days else None,
            "interrupts": sum(x["interrupts"] for x in users.values()),
            "interrupt_rate": rate(sum(x["interrupts"] for x in users.values()), prompts),
            "compacts": len(pre), "auto_compacts": auto, "auto_share": rate(auto, len(pre)),
            "compacts_per_session": round(len(pre) / sessions, 2) if sessions else None,
            "stop_median": median(stop) if stop else None, "stop_p90": _pct(stop, 0.9),
            **{f"{k}_users": v for k, v in reach.items()}, **{f"{k}_reach": rate(v, n) for k, v in reach.items()}}


def period(raw, p: dict, people: list) -> dict:
    """直近と前の期間の記録から、利用者ごと・日ごと・ツール・コンテキスト・時間帯を数え、利用明細の人の行に足す。"""
    start, end, recent_start = p["prev_start"], p["end"], p["start"]
    rows = _load(raw, start, end)
    recent = [r for r in rows if r["day"] >= recent_start]
    users, prev_users = _per_user(recent), _per_user([r for r in rows if r["day"] < recent_start])
    by_email = {u["email"]: u for u in people}
    for email, x in users.items():
        by_email.setdefault(email, {"email": email, "cost": None, "rank": None}).update(_person(x))
    people[:] = sorted(by_email.values(), key=lambda u: (u["rank"] is None, u["rank"] or 0, u["email"]))
    sql = "SELECT day, SUM(cost), COUNT(DISTINCT user_email) FROM cost_daily WHERE day BETWEEN ? AND ? GROUP BY 1"
    cost_days = {d: (c, n) for d, c, n in raw.execute(sql, (start, end))}
    days = end - recent_start + 1
    active_days = Counter(len(x["days"]) for x in users.values())
    return {"active": _active(recent, users, days), "active_prev": _active([r for r in rows if r["day"] < recent_start], prev_users, days),
            "daily": _daily(rows, cost_days, start, end, recent_start), "tools": _tools(recent),
            "context": _context(rows, recent_start), "hours": _hours(recent),
            "days_dist": [{"bin": d, "label": f"{d} 日", "count": active_days[d],
                           "now_share": rate(active_days[d], len(users))} for d in range(1, days + 1)],
            "sessions_dist": _sessions_dist(recent)}


def _sessions_dist(rows: list) -> list:
    per = Counter(r["session"] for r in rows if r["hook"] == "UserPromptSubmit" and r["session"])
    c = Counter(min(n, 10) for n in per.values())
    total = sum(c.values())
    return [{"bin": k, "label": f"{k} 件" + ("以上" if k == 10 else ""), "count": c[k], "now_share": rate(c[k], total)}
            for k in range(1, 11)]
