"""今の画面に無い指標（利用明細の側）。期間ごとの `x` を作る。記録（events）の側は extras_events.py。"""

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


def _cost_summary(people, prev_people, a, b) -> dict:
    total = sum(u["cost"] for u in people)
    prev_total = sum(u["cost"] for u in prev_people.values()) if prev_people else None
    n, pn = len(people), len(prev_people) if prev_people else None
    per = total / n if n else None
    pper = prev_total / pn if pn else None
    person_days = sum(u.get("days", 0) for u in people)
    return {"total": total, "prev": prev_total, "change": change(total, prev_total), "users": n, "users_prev": pn,
            "per_user": per, "per_user_prev": pper, "per_user_change": change(per, pper),
            "per_person_day": total / person_days if person_days else None,
            "start": a, "end": b}


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
    }
    if p["long"]:
        out["months"] = _months(raw, a, b)
        return out
    out.update(ev.period(raw, p, people))
    return out
