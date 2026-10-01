"""棚卸しの指標のうち extras.py・extras_events.py で数えていないもの（率・比・収集の状態・設定の推移）を `m` に足す。"""

import datetime as dt
from collections import Counter, defaultdict
from statistics import median

import jpholiday

EPOCH = dt.date(1970, 1, 1)
LARGE_CONTEXT = 100_000
WEEKS_TREND = 12


def rate(n, d):
    return None if not d else round(n / d * 100, 1)


def ratio(n, d, digits=2):
    return None if not d else round(n / d, digits)


def off_day(day: int) -> bool:
    d = EPOCH + dt.timedelta(days=day)
    return d.weekday() >= 5 or jpholiday.is_holiday(d)


def _cost_side(raw, a: int, b: int, pa, pb) -> dict:
    """利用明細から: 休日の利用・営業日の利用率・使い始めた人・継続・新しい鮮度。"""
    rows = raw.execute("SELECT day, user_email, SUM(cost) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY 1, 2", (a, b)).fetchall()
    total = sum(c for _, _, c in rows)
    off_cost = sum(c for d, _, c in rows if off_day(d))
    bdays = sum(1 for d in range(a, b + 1) if not off_day(d))
    per_user = defaultdict(set)
    for d, u, _ in rows:
        if not off_day(d):
            per_user[u].add(d)
    first = dict(raw.execute("SELECT user_email, MIN(day) FROM cost_daily WHERE cost > 0 GROUP BY 1"))
    users = {u for _, u, _ in rows}
    out = {"off_day_cost_share": rate(off_cost, total), "off_day_users": len({u for d, u, _ in rows if off_day(d)}),
           "active_day_rate": rate(sum(len(v) for v in per_user.values()), bdays * len(users)) if users else None,
           "business_days": bdays, "new_users": sorted(u for u in users if a <= first[u] <= b)}
    if pa is not None:
        prev = {u for (u,) in raw.execute("SELECT DISTINCT user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (pa, pb))}
        out["retention_rate"] = rate(len(prev & users), len(prev))
        out["left_users"] = sorted(prev - users)
    out["new_user_count"] = len(out["new_users"])
    return out


def _event_side(raw, a: int, b: int, pa: int, pb: int, cost_total: float, cost_users: set) -> dict:
    """記録から: セッションの長さ・ツール・サブエージェント・指示単位の権限モード・欠け・収集の止まり。"""
    q = lambda sql, *args: raw.execute(sql, args).fetchall()  # noqa: E731
    spans = [(mx - mn) / 60 for mn, mx in q("SELECT MIN(ts), MAX(ts) FROM events WHERE day BETWEEN ? AND ? AND session_id IS NOT NULL GROUP BY session_id", a, b)]
    prompts = q("SELECT COUNT(*) FROM events WHERE day BETWEEN ? AND ? AND hook_event = 'UserPromptSubmit'", a, b)[0][0]
    sessions = q("SELECT COUNT(DISTINCT session_id) FROM events WHERE day BETWEEN ? AND ?", a, b)[0][0]
    tools = q("SELECT COUNT(*), SUM(tool_name LIKE 'mcp__%'), COUNT(DISTINCT CASE WHEN tool_name LIKE 'mcp__%' THEN user_email END) FROM events"
              " WHERE day BETWEEN ? AND ? AND hook_event IN ('PostToolUse', 'PostToolUseFailure')", a, b)[0]
    runs, agent_tools, agent_users = q("SELECT COUNT(DISTINCT agent_id), SUM(hook_event IN ('PostToolUse', 'PostToolUseFailure')),"
                                       " COUNT(DISTINCT user_email) FROM events WHERE day BETWEEN ? AND ? AND agent_id IS NOT NULL", a, b)[0]
    users = {u for (u,) in q("SELECT DISTINCT user_email FROM events WHERE day BETWEEN ? AND ?", a, b)}
    prev_users = {u for (u,) in q("SELECT DISTINCT user_email FROM events WHERE day BETWEEN ? AND ?", pa, pb)}
    events = q("SELECT COUNT(*) FROM events WHERE day BETWEEN ? AND ?", a, b)[0][0]
    person_days = q("SELECT COUNT(*) FROM (SELECT DISTINCT user_email, day FROM events WHERE day BETWEEN ? AND ?)", a, b)[0][0]
    ctx = q("SELECT COUNT(*), COUNT(context_tokens), SUM(context_tokens >= ?) FROM events WHERE day BETWEEN ? AND ? AND hook_event IN ('Stop', 'PreCompact')", LARGE_CONTEXT, a, b)[0]
    unknown = q("SELECT COUNT(*) FROM events WHERE day BETWEEN ? AND ? AND (user_email IS NULL OR user_email = '')", a, b)[0][0]
    by_prompt = Counter(m for (m,) in q("SELECT permission_mode FROM events WHERE day BETWEEN ? AND ? AND hook_event = 'UserPromptSubmit' AND permission_mode IS NOT NULL", a, b))
    sources = Counter(s for (s,) in q("SELECT command_source FROM events WHERE day BETWEEN ? AND ? AND command_name IS NOT NULL", a, b))
    first_skill = dict(q("SELECT user_email, MIN(day) FROM events WHERE skill_name IS NOT NULL GROUP BY 1"))
    effort = defaultdict(Counter)
    for u, e in q("SELECT user_email, effort_level FROM events WHERE day BETWEEN ? AND ? AND effort_level IS NOT NULL", a, b):
        effort[u][e] += 1
    n_modes, n_src = sum(by_prompt.values()), sum(sources.values())
    return {
        "session_span_median_min": round(median(spans), 1) if spans else None,
        "session_span_dist": _bins([s for s in spans], (5, 15, 30, 60, 120, 240), "分"),
        "tool_calls_per_prompt": ratio(tools[0], prompts, 1), "cost_per_session": ratio(cost_total, sessions),
        "cost_per_prompt": ratio(cost_total, prompts), "mcp_calls": tools[1] or 0, "mcp_users": tools[2],
        "tool_calls_per_person_day": ratio(tools[0], person_days, 1),
        "subagent_runs": runs, "subagent_users": agent_users, "subagent_user_rate": rate(agent_users, len(users)),
        "subagent_tools_per_run": ratio(agent_tools or 0, runs, 1),
        "permission_mode_by_prompt": [{"key": k, "count": v, "share": rate(v, n_modes)} for k, v in by_prompt.most_common()],
        "command_source_share": [{"key": k, "count": v, "share": rate(v, n_src)} for k, v in sources.most_common()],
        "skill_first_users": sorted(u for u, d in first_skill.items() if a <= d <= b),
        "effort_by_user": {u: c.most_common(1)[0][0] for u, c in effort.items()},
        "large_context_share": rate(ctx[2] or 0, ctx[1]), "context_capture_rate": rate(ctx[1], ctx[0]),
        "events_per_person_day": ratio(events, person_days, 1), "unknown_user_share": rate(unknown, events),
        "uncollected_billed_users": sorted(cost_users - users), "collection_stopped_users": sorted((prev_users - users) & cost_users),
    }


def _bins(values: list, edges: tuple, unit: str) -> list:
    counts = Counter(next((i for i, e in enumerate(edges) if v < e), len(edges)) for v in values)
    labels = [f"{edges[0]} {unit}未満"] + [f"{edges[i - 1]}〜{edges[i]} {unit}" for i in range(1, len(edges))] + [f"{edges[-1]} {unit}以上"]
    return [{"bin": i, "label": lb, "count": counts[i], "now_share": rate(counts[i], len(values))} for i, lb in enumerate(labels)]


def period(raw, p: dict, x: dict) -> dict:
    cost = x.get("cost") or {}
    if not cost:
        return {}
    a, b = cost["start"], cost["end"]
    pa = None if p["long"] else a - (b - a + 1)
    out = _cost_side(raw, a, b, pa, None if pa is None else a - 1)
    t = x["tokens"]
    out.update(cache_write_share=rate(t["cache_write"], t["input"] + t["cache_read"] + t["cache_write"]),
               unit_cost=ratio(cost["total"], t["total"] / 1e6))
    if not p["long"]:
        users = {u["email"] for u in x["people"] if u.get("cost")}
        out.update(_event_side(raw, p["start"], p["end"], p["prev_start"], p["prev_end"], cost["total"], users))
    return out


def fixed(raw, today: int, targets: list, starts: dict) -> dict:
    """適用までの日数・適用結果の内訳・適用率の週ごとの推移・端末ごとの版・利用明細の鮮度。"""
    first = dict(raw.execute("SELECT user_email, MIN(day) FROM policy_state GROUP BY 1"))
    to_comply = [starts[u] - first[u] for u in starts if u in first]
    results = Counter(r for (r,) in raw.execute("SELECT apply_result FROM policy_state WHERE day > ?", (today - 30,)))
    trend = []
    for w in range(WEEKS_TREND, 0, -1):
        end = today - (w - 1) * 7
        rates = []
        for key, value in targets:
            latest = raw.execute("SELECT p.prev_value FROM policy_state p JOIN (SELECT user_email, host, MAX(ts) ts FROM policy_state"
                                 " WHERE key_name = ? AND day BETWEEN ? AND ? GROUP BY 1, 2) l ON p.user_email = l.user_email"
                                 " AND p.host = l.host AND p.ts = l.ts WHERE p.key_name = ?", (key, end - 29, end, key)).fetchall()
            rates.append(rate(sum(v == value for (v,) in latest), len(latest)))
        known = [r for r in rates if r is not None]
        trend.append({"day": end - 6, "end": end, "rate": round(sum(known) / len(known), 1) if known else None})
    terminals = raw.execute("SELECT user_email, host, claude_code_version, MAX(ts) FROM events WHERE day > ? AND claude_code_version IS NOT NULL"
                            " GROUP BY 1, 2", (today - 30,)).fetchall()
    csv_end = raw.execute("SELECT MAX(day) FROM cost_daily").fetchone()[0]
    return {"time_to_comply_median": median(to_comply) if to_comply else None,
            "time_to_comply_dist": _bins(to_comply, (1, 3, 7, 14, 30), "日"),
            "apply_result_share": [{"key": k, "count": v, "share": rate(v, sum(results.values()))} for k, v in results.most_common()],
            "compliance_trend": trend,
            "core_by_terminal": [{"email": u, "host": h, "version": v} for u, h, v, _ in terminals],
            "csv_freshness_days": None if csv_end is None else today - csv_end, "csv_end": csv_end}
