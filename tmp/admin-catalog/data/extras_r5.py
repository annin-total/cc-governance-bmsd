"""第 5 弾で足す値（`p[期間].r5`）: コストのカードのグラフの部品に使う日ごとの系列・利用者ごとの 1 人 1 営業日あたり・前の期間の利用者ごとのコスト。"""

import statistics
import sys

from ccgov.metrics import business_days as bd

YEAR_DAYS = 365  # 12 か月の系列の 1 年分の長さ（前の 1 年と並べて 2 年分）
MONTHS = 12  # 12 か月の暦月の棒の、直近と前のそれぞれの月数


def _company(raw) -> dict:
    return dict(raw.execute("SELECT day, name FROM company_holidays"))


def series(raw, cost: dict, long: bool) -> list:
    """日ごとのコスト・人数・営業日かどうか。7・28 日は前と直近の 2N 日、12 か月は窓の終わりまでの 365 日と前の 365 日。"""
    a, b = (cost["end"] - 2 * YEAR_DAYS + 1, cost["end"]) if long else (cost["prev_start"], cost["end"])
    cut = cost["end"] - YEAR_DAYS + 1 if long else cost["start"]
    sql = "SELECT day, SUM(cost), COUNT(DISTINCT user_email) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY 1"
    got = {d: (c, n) for d, c, n in raw.execute(sql, (a, b))}
    work = set(bd.business_days(a, b, _company(raw)))
    return [{"day": d, "cost": got.get(d, (0.0, 0))[0], "users": got.get(d, (0.0, 0))[1], "bd": d in work,
             "period": "recent" if d >= cut else "prev"} for d in range(a, b + 1)]


def per_user(raw, cost: dict) -> dict:
    """期間の利用者ごとの 1 人 1 営業日あたり（メールは出さない）・中央値・平均（平均は `per_user_bd` と一致する）。"""
    sql = "SELECT SUM(cost) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY user_email"
    days = cost["bd"]
    values = sorted(c / days for (c,) in raw.execute(sql, (cost["start"], cost["end"]))) if days else []
    return {"values": values, "median": statistics.median(values) if values else None, "mean": statistics.fmean(values) if values else None}


def prev_costs(raw, cost: dict, long: bool) -> list:
    """前の期間の利用者ごとのコスト（多い順。メールは出さない）。集中の曲線の前の期間に使う。合計は `prev_total` と一致する。12 か月は前と比べない。"""
    if long:
        return []
    sql = "SELECT SUM(cost) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY user_email"
    out = sorted((c for (c,) in raw.execute(sql, (cost["prev_start"], cost["prev_end"]))), reverse=True)
    if abs(sum(out) - cost["prev_total"]) > 0.01:
        sys.exit("前の期間の利用者ごとのコストの合計が prev_total と合わない")
    return out


def months(raw, cost: dict) -> list:
    """12 か月の暦月ごとのコスト・人数・1 営業日あたり・1 人 1 営業日あたり。直近の 12 か月（窓）と前の 12 か月。
    窓の境をまたぐ月は前と直近の 2 つに分け、窓の外の日は数えない（`partial` は月の途中で切れた行）。"""
    import extras_r3
    from ccgov.metrics.calendar import add_months, month_bounds

    company = extras_r3._company(raw)
    start, end = cost["start"], cost["end"]
    windows = (("prev", add_months(start, -MONTHS), start - 1), ("recent", start, end))
    out, lo = [], month_bounds(windows[0][1])[0]
    while lo <= end:
        hi = month_bounds(lo)[1]
        for period, w0, w1 in windows:
            a, b = max(lo, w0), min(hi, w1)
            if a <= b:
                x = extras_r3._bill(raw, a, b, company)
                out.append({"day": lo, "cost": x["total"], "users": x["users"], "per_bd": x["per_bd"], "per_user_bd": x["per_user_bd"],
                            "period": period, "partial": a > lo or b < hi})
        lo = hi + 1
    return out


def build(raw, p: dict) -> dict:
    c, long = p["r3"]["cost"], p["period"]["long"]
    out = {"series": series(raw, c, long), "per_user": per_user(raw, c), "prev_costs": prev_costs(raw, c, long)}
    if long:
        out["months"] = months(raw, c)
    return out
