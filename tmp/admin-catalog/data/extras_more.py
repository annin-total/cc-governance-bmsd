"""利用明細の利用者の出入り（使い始めた人・継続率）を `m` に、利用明細の鮮度を `fixed.m` に足す。"""


def rate(n, d):
    return None if not d else round(n / d * 100, 1)


def _cost_side(raw, a: int, b: int, pa, pb) -> dict:
    """使い始めた人（利用明細に初めてコストが出た人）と、前の期間からの継続。"""
    users = {u for (u,) in raw.execute("SELECT DISTINCT user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (a, b))}
    first = dict(raw.execute("SELECT user_email, MIN(day) FROM cost_daily WHERE cost > 0 GROUP BY 1"))
    out = {"new_users": sorted(u for u in users if a <= first[u] <= b)}
    if pa is not None:
        prev = {u for (u,) in raw.execute("SELECT DISTINCT user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (pa, pb))}
        out["retention_rate"] = rate(len(prev & users), len(prev))
        out["left_users"] = sorted(prev - users)
    out["new_user_count"] = len(out["new_users"])
    return out


def period(raw, p: dict, x: dict) -> dict:
    cost = x.get("cost") or {}
    if not cost:
        return {}
    a, b = cost["start"], cost["end"]
    pa = None if p["long"] else a - (b - a + 1)
    return _cost_side(raw, a, b, pa, None if pa is None else a - 1)


def fixed(raw, today: int) -> dict:
    csv_end = raw.execute("SELECT MAX(day) FROM cost_daily").fetchone()[0]
    return {"csv_freshness_days": None if csv_end is None else today - csv_end, "csv_end": csv_end}
