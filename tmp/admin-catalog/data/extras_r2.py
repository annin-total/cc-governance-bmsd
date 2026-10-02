"""第 2 弾で足す値: 呼び出し 4 種・利用者ごとの呼び出しとセッションの大きさ・セッションの大きさ・その適用前後・並べ替えた一覧。"""

import datetime as dt
from collections import Counter, defaultdict

CONTEXT_BIN = 20000
TOOL_EVENTS = ("PostToolUse", "PostToolUseFailure")
AGENT_TOOLS = ("Agent", "Task")
WEB_TOOLS = ("WebSearch", "WebFetch")
TOP = 3
EPOCH = dt.date(1970, 1, 1)


def rate(n, d):
    return None if not d else round(n / d * 100, 1)


def _q(values: list, q: float):
    """四分位（最近傍の順位）。空なら None。"""
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(round((len(s) - 1) * q)))]


def _external(tool: str):
    """外部ツールの名前と種類。MCP はサーバ名でまとめる。外部でなければ None。"""
    if tool and tool.startswith("mcp__"):
        return tool.split("__")[1], "mcp"
    return (tool, "web") if tool in WEB_TOOLS else None


def _calls(rows: list) -> dict:
    """1 つの窓の記録から、4 種の (名前 → 回数・利用者の集合)。"""
    out = {k: defaultdict(lambda: {"calls": 0, "users": set(), "kind": None}) for k in ("skills", "commands", "external", "agents")}

    def add(kind, key, email, sub=None):
        c = out[kind][key]
        c["calls"] += 1
        c["users"].add(email)
        c["kind"] = sub

    for r in rows:
        if r["skill"]:
            add("skills", r["skill"], r["email"])
        if r["command"]:
            add("commands", r["command"], r["email"])
        if r["hook"] in TOOL_EVENTS:
            ext = _external(r["tool"])
            if ext:
                add("external", ext[0], r["email"], ext[1])
            if r["tool"] in AGENT_TOOLS and not r["agent"]:
                add("agents", "agent", r["email"])
    return out


def _block(now: dict, prev: dict, all_users: int) -> dict:
    total, ptotal = sum(c["calls"] for c in now.values()), sum(c["calls"] for c in prev.values())
    users = set().union(*[c["users"] for c in now.values()]) if now else set()
    pusers = set().union(*[c["users"] for c in prev.values()]) if prev else set()
    rows = []
    for key in set(now) | set(prev):
        n, p = now.get(key), prev.get(key)
        calls, pc = (n or {}).get("calls", 0), (p or {}).get("calls", 0)
        kind = (n or p)["kind"]
        rows.append({"key": key, "kind": kind, "label": f"{key}（MCP）" if kind == "mcp" else key, "calls": calls, "prev": pc,
                     "diff": calls - pc, "users": len((n or {}).get("users", ())), "users_prev": len((p or {}).get("users", ())),
                     "share": rate(calls, total), "trend": "up" if calls > pc else "down" if calls < pc else "flat"})
    rows.sort(key=lambda r: (-r["calls"], -r["prev"], r["key"]))
    return {"total": total, "prev": ptotal, "delta": total - ptotal, "change": rate(total - ptotal, ptotal),
            "users": len(users), "users_prev": len(pusers), "all_users": all_users, "reach": rate(len(users), all_users),
            "kinds": sum(1 for r in rows if r["calls"]), "top": [r for r in rows if r["calls"]][:TOP], "rows": rows}


def _sessions(rows: list) -> dict:
    """セッションごとの (利用者, 最初の日, Stop のコンテキストの最大, 自動コンパクトに達したか)。"""
    s: dict = {}
    for r in rows:
        if not r["session"]:
            continue
        x = s.setdefault(r["session"], {"email": r["email"], "day": r["day"], "max": None, "auto": False})
        x["day"] = min(x["day"], r["day"])
        if r["hook"] == "Stop" and r["ctx"] is not None:
            x["max"] = r["ctx"] if x["max"] is None else max(x["max"], r["ctx"])
        if r["hook"] == "PreCompact" and r["trigger"] == "auto":
            x["auto"] = True
    return {k: v for k, v in s.items() if v["max"] is not None}


def _size(sessions: list) -> dict:
    sizes = [x["max"] for x in sessions]
    auto = sum(x["auto"] for x in sessions)
    return {"sessions": len(sessions), "median": _q(sizes, 0.5), "q1": _q(sizes, 0.25), "q3": _q(sizes, 0.75),
            "auto_sessions": auto, "auto_share": rate(auto, len(sessions)), "users": len({x["email"] for x in sessions})}


def _dist(sides: dict) -> list:
    """区間ごとの件数と割合。`sides` は {面の名前: セッションの並び}。"""
    bins: dict = defaultdict(lambda: {k: 0 for k in sides})
    for side, xs in sides.items():
        for x in xs:
            bins[x["max"] // CONTEXT_BIN * CONTEXT_BIN][side] += 1
    totals = {k: len(v) for k, v in sides.items()}
    return [{"bin": b, **c, **{f"{k}_share": rate(c[k], totals[k]) for k in sides}} for b, c in sorted(bins.items())]


def _top_text(counter: Counter) -> str:
    return " · ".join(f"{k} {n}" for k, n in counter.most_common(TOP))


def _per_user(rows: list, sessions: list) -> dict:
    u: dict = defaultdict(lambda: {"skills": Counter(), "commands": Counter(), "external": 0, "agents": 0})
    for r in rows:
        x = u[r["email"]]
        if r["skill"]:
            x["skills"][r["skill"]] += 1
        if r["command"]:
            x["commands"][r["command"]] += 1
        if r["hook"] in TOOL_EVENTS and _external(r["tool"]):
            x["external"] += 1
        if r["hook"] in TOOL_EVENTS and r["tool"] in AGENT_TOOLS and not r["agent"]:
            x["agents"] += 1
    by = defaultdict(list)
    for s in sessions:
        by[s["email"]].append(s)
    out = {}
    for email, x in u.items():
        ss = by.get(email, [])
        out[email] = {"skill_calls": sum(x["skills"].values()), "skill_kinds": len(x["skills"]),
                      "skills_top": [{"key": k, "calls": n} for k, n in x["skills"].most_common(TOP)], "skills_top_text": _top_text(x["skills"]) or None,
                      "command_calls": sum(x["commands"].values()), "command_kinds": len(x["commands"]),
                      "commands_top": [{"key": k, "calls": n} for k, n in x["commands"].most_common(TOP)], "commands_top_text": _top_text(x["commands"]) or None,
                      "external_calls": x["external"], "agent_launches": x["agents"],
                      "session_size": _q([s["max"] for s in ss], 0.5), "auto_share": rate(sum(s["auto"] for s in ss), len(ss)), "sized_sessions": len(ss)}
    return out


def period(raw, p: dict, x: dict, load) -> dict:
    """7・28 日: 呼び出し 4 種・セッションの大きさ・利用者ごとの行に呼び出しとセッションの大きさを足す。`load` は記録を読む関数。"""
    rows = load(raw, p["prev_start"], p["end"])
    recent = [r for r in rows if r["day"] >= p["start"]]
    prev = [r for r in rows if r["day"] < p["start"]]
    all_users = len({r["email"] for r in recent})
    now_c, prev_c = _calls(recent), _calls(prev)
    calls = {k: _block(now_c[k], prev_c[k], all_users) for k in now_c}
    sess = _sessions(rows)
    s_recent = [s for s in sess.values() if s["day"] >= p["start"]]
    s_prev = [s for s in sess.values() if s["day"] < p["start"]]
    size = {**_size(s_recent), "prev": _size(s_prev), "dist": _dist({"prev": s_prev, "recent": s_recent})}
    per = _per_user(recent, s_recent)
    for row in x["people"]:
        if row.get("active_days") is not None:
            row.update(per.get(row["email"], {}))
    return {"calls": calls, "size": size}


def lists(p: dict) -> None:
    """並べ替えた一覧: コストの順位のある人（`billed`）・記録のある人（`activity`）。12 か月はモデルの並びを足す。"""
    x = p["x"]
    x["billed"] = [r for r in x["people"] if r.get("rank") is not None]
    if "active" in x:
        x["activity"] = [r for r in x["people"] if r.get("active_days") is not None]
    else:
        x["model_keys"] = [r["key"] for r in x["models"]]


def _month(day: int) -> int:
    d = EPOCH + dt.timedelta(days=day)
    return (d.replace(day=1) - EPOCH).days


def retention_12m(raw, cost: dict) -> dict:
    """暦月ごとの継続率（前の月の利用者のうち、その月も使った割合）。最終月が途中なら除く。"""
    by: dict = defaultdict(set)
    for day, u in raw.execute("SELECT DISTINCT day, user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (cost["start"], cost["end"])):
        by[_month(day)].add(u)
    months = sorted(by)
    full = months if (EPOCH + dt.timedelta(days=cost["end"] + 1)).day == 1 else months[:-1]
    rows = [{"day": m, "rate": rate(len(by[a] & by[m]), len(by[a])), "left": len(by[a] - by[m])} for a, m in zip(full, full[1:])]
    return {"retention_rate": rows[-1]["rate"], "left_users": sorted(by[full[-2]] - by[full[-1]]), "retention_month": full[-1], "retention_rows": rows}


def effect(raw, starts: dict, span: int, load) -> dict:
    """適用前後のセッションの大きさ。準拠開始日の前 span 日と後 span 日（開始日は除く）に始まったセッション。"""
    lo, hi = min(starts.values()) - span, max(starts.values()) + span
    sess = _sessions(load(raw, lo, hi))
    before = [s for s in sess.values() if s["email"] in starts and starts[s["email"]] - span <= s["day"] < starts[s["email"]]]
    after = [s for s in sess.values() if s["email"] in starts and starts[s["email"]] < s["day"] <= starts[s["email"]] + span]
    return {"before": _size(before), "after": _size(after), "dist": _dist({"before": before, "after": after})}
