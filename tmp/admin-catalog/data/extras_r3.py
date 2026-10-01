"""第 3 弾で足す値（利用明細の側）: コストと利用者の状態・目安を超えた利用者・月末の見込みの状態。記録と設定の報告の側は extras_r3_more.py。"""

from collections import defaultdict
from typing import Optional

import judge
from ccgov.metrics import business_days as bd

SPANS = (("day", 1), ("week", judge.USER_COST_SPANS[0]), ("month", judge.USER_COST_SPANS[1]))
KINDS = ("new", "kept", "left")


def _company(raw) -> dict:
    return dict(raw.execute("SELECT day, name FROM company_holidays"))


def _bill(raw, a: int, b: int, company: dict) -> dict:
    """1 つの窓の合計・営業日数・利用者数と、その割り算。"""
    total, users = raw.execute("SELECT COALESCE(SUM(cost), 0), COUNT(DISTINCT user_email) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (a, b)).fetchone()
    days = len(bd.business_days(a, b, company))
    per_bd = total / days if days else None
    return {"total": total, "bd": days, "users": users, "per_bd": per_bd, "per_user_bd": per_bd / users if per_bd is not None and users else None}


def cost(raw, x_cost: dict, long: bool) -> dict:
    """`cost`・`per_user_bd`・`billed_users` の値。窓は今の画面の利用明細の窓（CSV の最終日で終わる）と同じ。"""
    company = _company(raw)
    a, b = x_cost["start"], x_cost["end"]
    now = _bill(raw, a, b, company)
    out = {**now, "start": a, "end": b}
    if long:
        out["months"] = _months(raw, a, b, company)
        return out
    n = b - a + 1
    prev = _bill(raw, a - n, a - 1, company)
    out.update({f"prev_{k}": v for k, v in prev.items()}, prev_start=a - n, prev_end=a - 1)
    out["total_change"] = judge.change(now["total"], prev["total"])
    out["per_bd_change"] = judge.change(now["per_bd"], prev["per_bd"])
    out["per_user_bd_change"] = judge.change(now["per_user_bd"], prev["per_user_bd"])
    out["users_change"] = judge.change(now["users"], prev["users"])
    out["users_diff"] = now["users"] - prev["users"]
    out["state"] = judge.rise(out["per_bd_change"], judge.COST_RISE)
    out["per_user_state"] = judge.rise(out["per_user_bd_change"], judge.COST_RISE)
    out["users_state"] = judge.drop(out["users_change"], judge.USERS_DROP)
    users = dict(raw.execute("SELECT day, COUNT(DISTINCT user_email) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY 1", (a - n, b)))
    out["daily"] = [{"day": d, "users": users.get(d, 0), "period": "recent" if d >= a else "prev"} for d in range(a - n, b + 1)]
    return out


def model_pt(models: list, prev_total) -> Optional[float]:
    """最も多いモデルの割合の、前の期間との差（ポイント）。"""
    if not models or not prev_total or models[0].get("prev") is None:
        return None
    return round(models[0]["share"] - models[0]["prev"] / prev_total * 100, 1)


def _months(raw, a: int, b: int, company: dict) -> list:
    """暦月ごとの 1 営業日あたりと 1 人 1 営業日あたり（12 か月のカードの内訳）。最初の暦月は窓の始まりから数える。"""
    import datetime as dt

    epoch = dt.date(1970, 1, 1)
    out, lo = [], a
    while lo <= b:
        d = epoch + dt.timedelta(days=lo)
        nxt = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        hi = min(b, (nxt - epoch).days - 1)
        out.append({"day": (d.replace(day=1) - epoch).days, **{k: v for k, v in _bill(raw, lo, hi, company).items() if k in ("per_bd", "per_user_bd")}})
        lo = hi + 1
    return out


def forecast(month: dict) -> dict:
    """月末の見込みを前月の実績と比べる。"""
    ch = judge.change(month.get("forecast"), month.get("prev_actual"))
    return {"change": ch, "diff": None if ch is None else month["forecast"] - month["prev_actual"], "state": judge.rise(ch, judge.COST_RISE)}


def _spans(raw, end: int) -> dict:
    """利用者ごとの 1 日の最大（と日付）・7 日の合計・28 日の合計。`end` は利用明細の最終日。"""
    longest = max(n for _, n in SPANS)
    daily = defaultdict(dict)
    sql = "SELECT user_email, day, SUM(cost) FROM cost_daily WHERE day BETWEEN ? AND ? GROUP BY 1, 2"
    for email, day, c in raw.execute(sql, (end - longest + 1, end)):
        daily[email][day] = c
    out = {}
    week = SPANS[1][1]
    for email, days in daily.items():
        recent = {d: c for d, c in days.items() if d > end - week}
        top_day = max(recent, key=recent.get) if recent else None
        out[email] = {"day": recent.get(top_day, 0.0), "day_at": top_day, "week": sum(recent.values()), "month": sum(days.values())}
    return out


def _judged(sums: dict) -> dict:
    """利用者ごとの目安ごとの状態と、最も重い状態。注意以上の人だけを返す。"""
    out = {}
    for email, s in sums.items():
        tones = {k: judge.over(s[k], judge.USER_COST_ELEVATED[k], judge.USER_COST_HIGH[k]) for k, _ in SPANS}
        worst = judge.worst(tones.values())
        if worst != judge.OK:
            out[email] = {"state": worst, "spans": tones}
    return out


def limit(raw, csv_end: int) -> dict:
    """目安を超えた利用者（`over_limit`・`over_users`）。前は基準日を 7 日前にずらした同じ判定。"""
    shift = SPANS[1][1]
    now_sums, prev_sums = _spans(raw, csv_end), _spans(raw, csv_end - shift)
    now, prev = _judged(now_sums), _judged(prev_sums)
    grid = [{"key": k, "warn": sum(1 for u in now.values() if u["spans"][k] == judge.WARN),
             "ng": sum(1 for u in now.values() if u["spans"][k] == judge.NG)} for k, _ in SPANS]
    prev_grid = [{"key": k, "warn": sum(1 for u in prev.values() if u["spans"][k] == judge.WARN),
                  "ng": sum(1 for u in prev.values() if u["spans"][k] == judge.NG)} for k, _ in SPANS]
    rows = []
    for email in sorted(set(now) | set(prev)):
        n, p = now.get(email), prev.get(email)
        kind = "kept" if n and p else "new" if n else "left"
        s = now_sums.get(email, {"day": 0.0, "day_at": None, "week": 0.0, "month": 0.0})
        spans = [k for k, _ in SPANS if n and n["spans"][k] != judge.OK]
        rows.append({"email": email, "state": n["state"] if n else judge.OK, "prev_state": p["state"] if p else judge.OK,
                     "kind": kind, "max_day": s["day"], "max_day_at": s["day_at"], "week": s["week"], "month": s["month"],
                     "rank": judge.RANK[n["state"] if n else judge.OK], "tags": ([n["state"]] if n else []) + [kind] + spans})
    rows.sort(key=lambda r: (r["rank"], -r["month"]))
    return {"end": csv_end, "prev_end": csv_end - shift, "start_week": csv_end - shift + 1, "start_month": csv_end - SPANS[2][1] + 1,
            "grid": grid, "prev_grid": prev_grid, "users": len(now), "prev_users": len(prev), "delta": len(now) - len(prev),
            "new": sum(r["kind"] == "new" for r in rows), "left": sum(r["kind"] == "left" for r in rows),
            "ng": sum(u["state"] == judge.NG for u in now.values()), "warn": sum(u["state"] == judge.WARN for u in now.values()),
            "state": judge.worst([u["state"] for u in now.values()]), "rows": rows, "by_user": {e: u["state"] for e, u in now.items()}}


def billed_rows(billed: list, by_user: dict, long: bool) -> None:
    """`user_cost` の行に状態（目安の判定）と増減率を足す。"""
    for r in billed:
        r["state"] = by_user.get(r["email"], judge.OK)
        r["state_rank"] = judge.RANK[r["state"]]
        r["cost_change"] = None if long else judge.change(r["cost"], r.get("cost_prev"))
        r["tags"] = [r["state"], r["top_model"]]
