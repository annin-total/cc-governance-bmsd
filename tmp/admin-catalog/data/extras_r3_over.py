"""基準を超えた利用者（`over_day`・`over_week`・`over_month`・`over_users`）。窓は `bill`（利用明細の最終日までの N 日）と前の N 日。"""

from collections import defaultdict

import judge

SPANS = {"7": ("day", "week"), "28": ("month",)}  # 期間のタブごとの区分。12 か月は出さない
VALUE = {"day": "max_day", "week": "total", "month": "total"}  # 日次は N 日のいずれかの 1 日、週次・月次は N 日の合計
SPAN_RANK = {"day": 0, "week": 1, "month": 2}
TOP = 3


def _sums(raw, a: int, b: int) -> dict:
    """利用者ごとの N 日の合計と、最大の 1 日（と日付）。"""
    daily = defaultdict(dict)
    sql = "SELECT user_email, day, SUM(cost) FROM cost_daily WHERE day BETWEEN ? AND ? GROUP BY 1, 2"
    for email, day, c in raw.execute(sql, (a, b)):
        daily[email][day] = c
    out = {}
    for email, days in daily.items():
        top = max(days, key=days.get)
        out[email] = {"max_day": days[top], "max_day_at": top, "total": sum(days.values())}
    return out


def _tones(sums: dict, span: str) -> dict:
    """注意以上の利用者とその状態。"""
    out = {}
    for email, s in sums.items():
        t = judge.over(s[VALUE[span]], judge.USER_COST_ELEVATED[span], judge.USER_COST_HIGH[span])
        if t != judge.OK:
            out[email] = t
    return out


def _count(tones: dict, tone: str) -> int:
    return sum(t == tone for t in tones.values())


def _span(span: str, now_sums: dict, now: dict, prev: dict, cost: dict) -> dict:
    """1 枚のカードの値。割合は期間の利用者とコストのうち。"""
    spent = sum(now_sums[e]["total"] for e in now)
    top = sorted(now, key=lambda e: -now_sums[e][VALUE[span]])[:TOP]
    users, all_users = len(now), cost["users"]
    ng = _count(now, judge.NG)
    return {
        "key": span, "users": users, "prev_users": len(prev), "delta": users - len(prev),
        "new": len(set(now) - set(prev)), "left": len(set(prev) - set(now)),
        "ng": ng, "ng_delta": ng - _count(prev, judge.NG), "warn": _count(now, judge.WARN), "prev_ng": _count(prev, judge.NG), "prev_warn": _count(prev, judge.WARN),
        "ok": all_users - users, "all_users": all_users, "user_share": judge.share(users, all_users), "cost": spent, "cost_share": judge.share(spent, cost["total"]),
        "state": judge.worst(now.values()), "elevated": judge.USER_COST_ELEVATED[span], "high": judge.USER_COST_HIGH[span],
        "top": [{"email": e, "value": now_sums[e][VALUE[span]], "state": now[e]} for e in top],
    }


def _row(email: str, span: str, sums: dict, now: dict, prev: dict) -> dict:
    """1 人 × 1 区分の行。区分ごとに判定するので、絞り込むとその区分のカードの人数と合う。"""
    n, p = now.get(email, judge.OK), prev.get(email, judge.OK)
    kind = "kept" if n != judge.OK and p != judge.OK else "new" if n != judge.OK else "left"
    s = sums.get(email, {"max_day": 0.0, "max_day_at": None, "total": 0.0})
    return {"email": email, "span": span, "span_rank": SPAN_RANK[span], "state": n, "prev_state": p, "kind": kind, "rank": judge.RANK[n],
            "value": s[VALUE[span]], "value_at": s["max_day_at"] if span == "day" else None,
            "tags": ([n] if n != judge.OK else []) + [kind, span]}


def build(raw, key: str, cost: dict) -> dict:
    """期間 1 つ分（7・28 日）。`cost` は `r3.cost`（窓・人数・合計）。前は窓を N 日前にずらした同じ判定。"""
    spans = SPANS[key]
    a, b, pa, pb = cost["start"], cost["end"], cost["prev_start"], cost["prev_end"]
    now_sums, prev_sums = _sums(raw, a, b), _sums(raw, pa, pb)
    now = {s: _tones(now_sums, s) for s in spans}
    prev = {s: _tones(prev_sums, s) for s in spans}
    out = {s: _span(s, now_sums, now[s], prev[s], cost) for s in spans}
    rows = [_row(e, s, now_sums, now[s], prev[s]) for s in spans for e in set(now[s]) | set(prev[s])]
    rows.sort(key=lambda r: (r["span_rank"], r["rank"], -r["value"]))
    by_user = {e: judge.worst(now[s].get(e) for s in spans) for e in now_sums}
    return {**out, "spans": list(spans), "state": judge.worst(o["state"] for o in out.values()), "rows": rows,
            "row_users": len({r["email"] for r in rows}), "by_user": by_user}
