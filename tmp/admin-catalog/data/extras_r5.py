"""第 5 弾で足す値（`p[期間].r5`）: コストのカードのグラフの部品に使う日ごとの系列・利用者ごとの 1 人 1 営業日あたり・前の期間の利用者ごとのコスト。"""

import statistics
import sys

from ccgov.metrics import business_days as bd

YEAR_DAYS = 365  # 12 か月の系列の長さ


def _company(raw) -> dict:
    return dict(raw.execute("SELECT day, name FROM company_holidays"))


def series(raw, cost: dict, long: bool) -> list:
    """日ごとのコスト・人数・営業日かどうか。7・28 日は前と直近の 2N 日、12 か月は窓の終わりまでの 365 日。"""
    a, b = (cost["end"] - YEAR_DAYS + 1, cost["end"]) if long else (cost["prev_start"], cost["end"])
    sql = "SELECT day, SUM(cost), COUNT(DISTINCT user_email) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY 1"
    got = {d: (c, n) for d, c, n in raw.execute(sql, (a, b))}
    work = set(bd.business_days(a, b, _company(raw)))
    return [{"day": d, "cost": got.get(d, (0.0, 0))[0], "users": got.get(d, (0.0, 0))[1], "bd": d in work,
             "period": None if long else "recent" if d >= cost["start"] else "prev"} for d in range(a, b + 1)]


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


def build(raw, p: dict) -> dict:
    c, long = p["r3"]["cost"], p["period"]["long"]
    return {"series": series(raw, c, long), "per_user": per_user(raw, c), "prev_costs": prev_costs(raw, c, long)}
