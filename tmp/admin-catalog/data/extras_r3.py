"""第 3 弾で足す値（利用明細の側）: コストと利用者の状態・月末の見込みの状態。基準を超えた利用者は extras_r3_over.py、記録と設定の報告の側は extras_r3_more.py。"""

from typing import Optional

import judge
from ccgov.metrics import business_days as bd


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


def billed_rows(billed: list, by_user: dict, long: bool) -> None:
    """`user_cost` の行に状態（期間の基準の判定。12 か月は判定しない）と増減率を足す。"""
    for r in billed:
        r["state"] = None if long else by_user.get(r["email"], judge.OK)
        r["state_rank"] = None if long else judge.RANK[r["state"]]
        r["cost_change"] = None if long else judge.change(r["cost"], r.get("cost_prev"))
        r["tags"] = [t for t in (r["state"], r["top_model"]) if t]
