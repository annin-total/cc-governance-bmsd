"""今の画面に無い指標（利用明細の側）。期間ごとの `x` と、期間に依らない `fixed.x` を作る。記録（events）の側は extras_events.py。"""

import sqlite3
from collections import defaultdict

import extras_events as ev

WEEK = 7


def rate(n, d):
    return None if not d else round(n / d * 100, 1)


def change(now, prev):
    return None if now is None or not prev else round((now - prev) / prev * 100, 1)


def user_count(raw: sqlite3.Connection) -> int:
    return raw.execute("SELECT COUNT(DISTINCT user_email) FROM cost_daily").fetchone()[0]


def _by_user(raw, a: int, b: int) -> dict:
    """利用者ごとのコスト・トークン・日数・モデル別コスト。"""
    out: dict = {}
    sql = """SELECT user_email, model, SUM(cost), SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens),
             SUM(cache_write_tokens), COUNT(DISTINCT day) FROM cost_daily WHERE day BETWEEN ? AND ? GROUP BY 1, 2"""
    for email, model, cost, i, o, cr, cw, _ in raw.execute(sql, (a, b)):
        u = out.setdefault(email, {"email": email, "cost": 0.0, "input": 0, "output": 0, "cache_read": 0,
                                   "cache_write": 0, "models": {}})
        u["cost"] += cost
        u["input"] += i
        u["output"] += o
        u["cache_read"] += cr
        u["cache_write"] += cw
        u["models"][model] = round(cost, 2)
    days = "SELECT user_email, COUNT(DISTINCT day) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY 1"
    for email, n in raw.execute(days, (a, b)):
        out[email]["days"] = n
    return out


def _tokens(rows) -> dict:
    t = {k: sum(r[k] for r in rows) for k in ("input", "output", "cache_read", "cache_write")}
    t["total"] = sum(t.values())
    t["cache_read_share"] = rate(t["cache_read"], t["input"] + t["cache_read"] + t["cache_write"])
    t["output_share"] = rate(t["output"], t["total"])
    return t


def _models(raw, a, b, pa, pb) -> list:
    sql = """SELECT model, SUM(cost), SUM(input_tokens), SUM(output_tokens), SUM(cache_read_tokens),
             SUM(cache_write_tokens), COUNT(DISTINCT user_email) FROM cost_daily WHERE day BETWEEN ? AND ? GROUP BY 1"""
    prev = {m: c for m, c, *_ in raw.execute(sql, (pa, pb))} if pa else {}
    rows = [dict(zip(("key", "cost", "input", "output", "cache_read", "cache_write", "users"), r))
            for r in raw.execute(sql, (a, b))]
    total = sum(r["cost"] for r in rows)
    for r in rows:
        r["tokens"] = r["input"] + r["output"] + r["cache_read"] + r["cache_write"]
        r["share"] = rate(r["cost"], total)
        r["prev"] = prev.get(r["key"])
        r["diff"] = None if r["prev"] is None else r["cost"] - r["prev"]
        r["per_mtok"] = round(r["cost"] / r["tokens"] * 1e6, 2) if r["tokens"] else None
    return sorted(rows, key=lambda r: -r["cost"])


def _people(now: dict, prev: dict) -> list:
    total = sum(u["cost"] for u in now.values()) or 1
    rows = sorted(now.values(), key=lambda u: -u["cost"])
    acc = 0.0
    for i, u in enumerate(rows):
        acc += u["cost"]
        u.update(rank=i + 1, share=rate(u["cost"], total), cum_share=rate(acc, total),
                 tokens=u["input"] + u["output"] + u["cache_read"] + u["cache_write"],
                 cost_prev=(prev.get(u["email"]) or {}).get("cost"),
                 per_day=round(u["cost"] / u["days"], 2) if u.get("days") else None)
        u["cost_diff"] = None if u["cost_prev"] is None else u["cost"] - u["cost_prev"]
        u["top_model"] = max(u["models"], key=u["models"].get) if u["models"] else None
        u["cache_share"] = rate(u["cache_read"], u["input"] + u["cache_read"] + u["cache_write"])
    return rows


def _dist(values: list, step: float, fmt) -> list:
    """1 系列の分布（区間の下限・名前・件数・割合）。`now_share` は分布の棒の部品が読む。"""
    if not values:
        return []
    top = int(max(values) // step) + 1
    counts = [0] * top
    for v in values:
        counts[int(v // step)] += 1
    return [{"bin": i * step, "label": fmt(i * step, (i + 1) * step), "count": c, "now_share": rate(c, len(values))}
            for i, c in enumerate(counts)]


def _cost_summary(people, prev_people, a, b) -> dict:
    total = sum(u["cost"] for u in people)
    prev_total = sum(u["cost"] for u in prev_people.values()) if prev_people else None
    n, pn = len(people), len(prev_people) if prev_people else None
    per = total / n if n else None
    pper = prev_total / pn if pn else None
    top_n = max(1, round(n * 0.1)) if n else 0
    person_days = sum(u.get("days", 0) for u in people)
    return {"total": total, "prev": prev_total, "change": change(total, prev_total), "users": n, "users_prev": pn,
            "per_user": per, "per_user_prev": pper, "per_user_change": change(per, pper),
            "per_person_day": total / person_days if person_days else None,
            "top10_share": rate(sum(u["cost"] for u in people[:top_n]), total), "top10_n": top_n,
            "top5_share": rate(sum(u["cost"] for u in people[:5]), total), "start": a, "end": b}


def _weekday(raw, a, b) -> list:
    sql = "SELECT day, SUM(cost), COUNT(DISTINCT user_email) FROM cost_daily WHERE day BETWEEN ? AND ? GROUP BY 1"
    acc = defaultdict(lambda: [0.0, 0, 0])
    for day, cost, users in raw.execute(sql, (a, b)):
        w = (day + 3) % WEEK  # epoch 日 0 は木曜。月曜を 0 にする
        acc[w][0] += cost
        acc[w][1] += users
        acc[w][2] += 1
    return [{"key": w, "cost": round(acc[w][0] / acc[w][2], 2), "users": round(acc[w][1] / acc[w][2], 1)}
            for w in range(WEEK) if acc[w][2]]


def _months(raw, a, b) -> list:
    """暦月ごとのコスト・利用者・1 人あたり・新しく使い始めた人（利用明細に初めて出た月）。"""
    first = dict(raw.execute("SELECT user_email, MIN(day) FROM cost_daily GROUP BY 1").fetchall())
    sql = "SELECT day, user_email, model, cost FROM cost_daily WHERE day BETWEEN ? AND ?"
    acc: dict = {}
    import datetime as dt
    epoch = dt.date(1970, 1, 1)
    for day, email, model, cost in raw.execute(sql, (a, b)):
        d = epoch + dt.timedelta(days=day)
        key = (d.replace(day=1) - epoch).days
        m = acc.setdefault(key, {"day": key, "cost": 0.0, "users": set(), "models": defaultdict(float), "new": set()})
        m["cost"] += cost
        m["users"].add(email)
        m["models"][model] += cost
        if (epoch + dt.timedelta(days=first[email])).replace(day=1) == d.replace(day=1):
            m["new"].add(email)
    rows = []
    for key in sorted(acc):
        m = acc[key]
        n = len(m["users"])
        rows.append({"day": key, "cost": m["cost"], "users": n, "per_user": m["cost"] / n if n else None,
                     "new_users": len(m["new"]), "models": {k: round(v, 2) for k, v in m["models"].items()}})
    return rows


def period(raw, p: dict, cost: dict) -> dict:
    """期間 1 つ分。利用明細の窓は今の画面と同じく CSV の最終日で終わる。記録の側は 7・28 日だけ。"""
    if cost.get("end") is None:
        return {}
    a, b = cost["start"], cost["end"]
    pa, pb = (None, None) if p["long"] else (cost["spark_start"], a - 1)
    now, prev = _by_user(raw, a, b), (_by_user(raw, pa, pb) if pa else {})
    people = _people(now, prev)
    out = {
        "cost": _cost_summary(people, prev, a, b),
        "models": _models(raw, a, b, pa, pb),
        "tokens": _tokens(people),
        "people": people,
        "cost_dist": _dist([u["cost"] for u in people], _nice(max((u["cost"] for u in people), default=0) / 8),
                           lambda lo, hi: f"${lo:,.0f}–{hi:,.0f}"),
        "weekday": _weekday(raw, a, b),
    }
    if p["long"]:
        out["months"] = _months(raw, a, b)
        return out
    out.update(ev.period(raw, p, people))
    return out


def _nice(x: float) -> float:
    for m in (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000):
        if m >= x:
            return m
    return 10000


def fixed(raw, today: int, policy: dict) -> dict:
    """期間に依らないもの: 設定の適用状況（直近 30 日）と利用明細のコストの突き合わせ。"""
    status = {u["email"]: u["status"] for u in policy["users"]}
    end = raw.execute("SELECT MAX(day) FROM cost_daily").fetchone()[0]
    cost = dict(raw.execute("SELECT user_email, SUM(cost) FROM cost_daily WHERE day > ? GROUP BY 1", (end - 30,)))
    by = defaultdict(lambda: {"users": 0, "cost": 0.0})
    for email, s in status.items():
        by[s]["users"] += 1
        by[s]["cost"] += cost.get(email, 0.0)
    total = sum(cost.values()) or 1
    return {"policy_cost": [{"key": k, "users": v["users"], "cost": v["cost"], "share": rate(v["cost"], total)}
                            for k, v in by.items()]}
