"""組織 CSV の部・課を利用者に引き、課ごとの集計（`sections`）を作る。名簿は scripts/ の本物の seed の合成で、実物の組織 CSV は使わない。

名簿に無い利用者は部・課を None（画面では「不明」）、名簿にいて課の欄が空の人は課を ""（画面では「—」）にする。
"""

import datetime as dt
import random
import sys
from collections import defaultdict

EPOCH = dt.date(1970, 1, 1)
IMPORTED = dt.date(2026, 9, 1)  # 取り込んだ日（月 1 回の更新）
EMAIL, DEPT, SECTION = "Email - Primary Work", "Department", "Section"
OVER_SPAN = {"7": "week", "28": "month"}
ORG_SALT, LAGGED_OUT, ACTIVE_OUT = 3, 1, 4  # 名簿に無い（不明の）利用者: 漏れた人から 1 人・直近 7 日にコストのある人から 4 人  # 課ごとの「基準を超えた利用者」の区分（7 日は週次、28 日は月次）


def roster(n_users: int, users: list, active: list) -> tuple:
    """名簿（`fixed.org`）と、メール → (部, 課)。scripts/ と server/ が import の経路にあること。

    本物の seed は名簿から漏れる人（不明）が途絶えた端末の利用者に重なるため、漏れる人を入れ替える:
    漏れた人のうち LAGGED_OUT 人だけを残して名簿に足し、直近にコストのある `active` から ACTIVE_OUT 人を名簿から外す。
    """
    from seed_dashboard import SEED
    from seed_dashboard_rows import roster as make
    from seed_org_columns import org_unit

    rows = make(random.Random(SEED), n_users)
    rng = random.Random(SEED + ORG_SALT)  # 乱数は本物の seed の流れと分ける
    listed = {r[EMAIL] for r in rows}
    lagged = sorted(u for u in users if u not in listed)
    out = set(rng.sample(lagged, min(LAGGED_OUT, len(lagged)))) | set(rng.sample(sorted(active), min(ACTIVE_OUT, len(active))))
    for u in lagged:
        if u not in out:
            org = org_unit(rng)
            rows.append({EMAIL: u, DEPT: org[0], SECTION: org[1]})
    rows = [r for r in rows if r[EMAIL] not in out]
    by = {r[EMAIL]: (r[DEPT], r[SECTION]) for r in rows if "@" in r[EMAIL]}
    depts = sorted({d for d, _ in by.values()})
    return {"imported": (IMPORTED - EPOCH).days, "rows": len(rows), "depts": depts}, by


def annotate(rows: list, by: dict) -> None:
    """利用者ごとの行に `dept`・`section` を足す。"""
    for r in rows:
        r["dept"], r["section"] = by.get(r["email"], (None, None))


def _costs(raw, a: int, b: int) -> dict:
    sql = "SELECT user_email, SUM(cost) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY 1"
    return dict(raw.execute(sql, (a, b)))


def _order(key: tuple) -> tuple:
    dept, section = key
    return (dept is None, dept or "", section == "", section or "")


def sections(raw, key: str, p: dict, by: dict) -> list:
    """課ごとの利用者数・コスト・前・差・率・割合・1 人 1 営業日あたり・注意以上の人数（7・28 日）と記録の段（案 42 用）。"""
    c, long = p["r3"]["cost"], p["period"]["long"]
    now = _costs(raw, c["start"], c["end"])
    prev = {} if long else _costs(raw, c["prev_start"], c["prev_end"])
    span = OVER_SPAN.get(key)
    over = set() if long else {r["email"] for r in p["r3"]["over"]["rows"] if r["span"] == span and r["state"] != "ok"}
    acts = {} if long else {r["email"]: r for r in p["x"]["activity"]}
    g: dict = defaultdict(lambda: {"users": 0, "cost": 0.0, "prev": 0.0, "over": 0, "act": [], "days": 0, "prompts": 0, "skills": 0, "commands": 0})
    for u in set(now) | set(prev) | set(acts):
        x = g[by.get(u, (None, None))]
        x["users"] += u in now
        x["cost"] += now.get(u, 0.0)
        x["prev"] += prev.get(u, 0.0)
        x["over"] += u in over
        if u in acts:
            a = acts[u]
            x["act"].append(u)
            x["days"] += a["active_days"]
            x["prompts"] += a["prompts"]
            x["skills"] += a.get("skill_calls", 0)
            x["commands"] += a.get("command_calls", 0)
    rows = [_row(k, g[k], c, long) for k in sorted(g, key=_order)]
    if sum(r["users"] for r in rows) != c["users"] or abs(sum(r["cost"] for r in rows) - c["total"]) > 0.01:
        sys.exit(f"p.{key} の sections の合計が利用者数・コストと合わない")
    return rows


def _row(k: tuple, x: dict, c: dict, long: bool) -> dict:
    users, cost, bd = x["users"], x["cost"], c["bd"]
    row = {"dept": k[0], "section": k[1], "users": users, "cost": cost, "share": round(cost / c["total"] * 100, 1) if c["total"] else None,
           "per_user_bd": cost / bd / users if users and bd else None}
    if long:
        return row
    n = len(x["act"])
    row.update(prev=x["prev"], diff=cost - x["prev"], change=round((cost - x["prev"]) / x["prev"] * 100, 1) if x["prev"] else None, over=x["over"],
               rec_users=n, days_per_user=round(x["days"] / n, 1) if n else None,
               prompts_per_person_day=round(x["prompts"] / x["days"], 1) if x["days"] else None, skill_calls=x["skills"], command_calls=x["commands"])
    return row
