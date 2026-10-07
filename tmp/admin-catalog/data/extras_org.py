"""組織 CSV の部・課を利用者に引き、部署ごとの集計（`r5.depts`）を作る。名簿は scripts/ の本物の seed の合成で、実物の組織 CSV は使わない。

名簿に無い利用者は部・課を None（画面では「不明」）、名簿にいて課の欄が空の人は課を ""（画面では「—」）にする。
"""

import datetime as dt
import random
import re
import sys
from collections import defaultdict

EPOCH = dt.date(1970, 1, 1)
IMPORTED = dt.date(2026, 9, 1)  # 取り込んだ日（月 1 回の更新）
EMAIL, DEPT, SECTION = "Email - Primary Work", "Department", "Section"
OVER_SPAN = {"7": "week", "28": "month"}  # 部署ごとの「基準を超えた利用者」の区分（7 日は週次、28 日は月次）
ORG_SALT, LAGGED_OUT, ACTIVE_OUT = 3, 1, 4  # 名簿に無い（不明の）利用者: 漏れた人から 1 人・直近 7 日にコストのある人から 4 人
SECTIONS_PER_DEPT = 10  # 本物の seed の ORG_BRANCHES（部ごとの課の数）を、名簿を作るときだけ差し替える
UNLISTED_DAYS = 30  # 取り込みの欄の「名簿に無い利用者」は、利用明細の最終日までの 30 日にコストがあった人で数える
# 取り込んだ名簿の月（今月から何か月前か）。先頭の欠け（8〜6 か月前）・途中の欠け（5 か月前）・最新の欠け（今月）を作り、適用の決まりを画面で読めるようにする
ROSTER_AGO = (1, 2, 3, 4, 6, 7, 8)
SHOWN_MONTHS = 12  # 取り込みの欄に並べる月（今月まで）
JOINERS_PER_MONTH = 3  # 古い名簿ほど、後から入った人を月ごとに何人ずつ抜くか


def roster(n_users: int, users: list, active: list) -> tuple:
    """名簿と、メール → (部, 課)。scripts/ と server/ が import の経路にあること。

    本物の seed は名簿から漏れる人（不明）が途絶えた端末の利用者に重なるため、漏れる人を入れ替える:
    漏れた人のうち LAGGED_OUT 人だけを残して名簿に足し、直近にコストのある `active` から ACTIVE_OUT 人を名簿から外す。
    """
    import seed_org_columns
    from seed_dashboard import SEED
    from seed_dashboard_rows import roster as make

    seed_org_columns.ORG_BRANCHES = SECTIONS_PER_DEPT  # scripts/ のファイルは変えず、実行時だけ課を増やす
    rows = make(random.Random(SEED), n_users)
    rng = random.Random(SEED + ORG_SALT)  # 乱数は本物の seed の流れと分ける
    listed = {r[EMAIL] for r in rows}
    lagged = sorted(u for u in users if u not in listed)
    out = set(rng.sample(lagged, min(LAGGED_OUT, len(lagged)))) | set(rng.sample(sorted(active), min(ACTIVE_OUT, len(active))))
    for u in lagged:
        if u not in out:
            org = seed_org_columns.org_unit(rng)
            rows.append({EMAIL: u, DEPT: org[0], SECTION: org[1]})
    rows = [r for r in rows if r[EMAIL] not in out]
    by = {r[EMAIL]: (r[DEPT], r[SECTION]) for r in rows if "@" in r[EMAIL]}
    units = _units(by)
    org = {"imported": (IMPORTED - EPOCH).days, "rows": len(rows), "depts": list(units), "units": units,
           "depts_n": len(units), "sections_n": sum(len([s for s in v if s]) for v in units.values())}
    return org, by


def _units(by: dict) -> dict:
    units = defaultdict(set)
    for d, s in by.values():
        units[d].add(s)
    return {d: sorted(units[d], key=_natural) for d in sorted(units)}


def month_start(day: int, ago: int = 0) -> int:
    """`day` の月から `ago` か月前の月の初日。"""
    from ccgov.metrics.calendar import add_months, month_bounds

    return month_bounds(add_months(month_bounds(day)[0], -ago))[0]


def applied(months: list, shown: list) -> list:
    """名簿の適用の決まり: その月の名簿があればそれ、無ければ前の最新、前が無ければ後の最初の名簿。"""
    have = sorted(months)
    out = []
    for m in shown:
        before = [x for x in have if x <= m]
        out.append({"month": m, "use": before[-1] if before else next((x for x in have if x > m), None)})
    return out


def monthly(raw, by: dict, today: int) -> tuple:
    """月ごとの名簿（取り込んだ月だけ）と、直近 12 か月の各月に使う名簿。最新の名簿は `by`、古い名簿ほど後から入った人を抜く。"""
    from ccgov.metrics.calendar import month_bounds

    order = sorted(by)
    random.Random(ORG_SALT).shuffle(order)
    latest = min(ROSTER_AGO)
    rosters = []
    for ago in sorted(ROSTER_AGO, reverse=True):
        drop = set(order[:(ago - latest) * JOINERS_PER_MONTH])
        m = {u: v for u, v in by.items() if u not in drop}
        lo, hi = month_bounds(month_start(today, ago))
        units = _units(m)
        cost_users = {u for (u,) in raw.execute("SELECT DISTINCT user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (lo, hi))}
        rosters.append({"month": lo, "file": f"org_{EPOCH + dt.timedelta(days=lo):%Y%m}.csv", "rows": len(m), "depts_n": len(units),
                        "sections_n": sum(len([s for s in v if s]) for v in units.values()), "unlisted": len(cost_users - set(m)),
                        "imported": month_bounds(hi + 1)[0]})
    shown = [month_start(today, ago) for ago in range(SHOWN_MONTHS - 1, -1, -1)]
    return rosters, applied([r["month"] for r in rosters], shown)


def _natural(s: str) -> tuple:
    """課の並び（Section A2 を A10 より前に。空の課は末尾）。"""
    return (s == "", [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", s)])


def unlisted(raw, csv_end: int, by: dict) -> int:
    """利用明細の最終日までの 30 日にコストがあった利用者のうち、名簿に無い人数。"""
    sql = "SELECT DISTINCT user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0"
    return sum(u not in by for (u,) in raw.execute(sql, (csv_end - UNLISTED_DAYS + 1, csv_end)))


def annotate(rows: list, by: dict) -> None:
    """利用者ごとの行に `dept`・`section` を足す。"""
    for r in rows:
        r["dept"], r["section"] = by.get(r["email"], (None, None))


def _costs(raw, a: int, b: int) -> dict:
    sql = "SELECT user_email, SUM(cost) FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0 GROUP BY 1"
    return dict(raw.execute(sql, (a, b)))


def depts(raw, key: str, p: dict, by: dict) -> list:
    """部署ごと（タブ `depts`）の行: 部の行（部全体の合算）・その部の課の行（コストの多い順、空の課は末尾）・末尾に不明の行。"""
    c, long = p["r3"]["cost"], p["period"]["long"]
    now = _costs(raw, c["start"], c["end"])
    prev = {} if long else _costs(raw, c["prev_start"], c["prev_end"])
    span = OVER_SPAN.get(key)
    over = set() if long else {r["email"] for r in p["r3"]["over"]["rows"] if r["span"] == span and r["state"] != "ok"}
    g: dict = defaultdict(lambda: {"users": 0, "cost": 0.0, "prev": 0.0, "over": 0})
    for u in set(now) | set(prev):
        d, s = by.get(u, (None, None))
        for k in ((d, None), (d, s)) if d is not None else ((None, None),):
            x = g[k]
            x["users"] += u in now
            x["cost"] += now.get(u, 0.0)
            x["prev"] += prev.get(u, 0.0)
            x["over"] += u in over
    rows = []
    for d in sorted({d for d, _ in g if d is not None}):
        rows.append(_row("dept", d, None, g[(d, None)], c, long))
        secs = sorted((s for dd, s in g if dd == d and s is not None), key=lambda s: (s == "", -g[(d, s)]["cost"]))
        rows += [_row("section", d, s, g[(d, s)], c, long) for s in secs]
    if (None, None) in g:
        rows.append(_row("unknown", None, None, g[(None, None)], c, long))
    _check(key, rows, c)
    return rows


def _check(key: str, rows: list, c: dict) -> None:
    """部の行と不明の行の合計が利用明細の人数・コストに一致し、部の行がその部の課の行の合計であること。"""
    top = [r for r in rows if r["kind"] != "section"]
    if sum(r["users"] for r in top) != c["users"] or abs(sum(r["cost"] for r in top) - c["total"]) > 0.01:
        sys.exit(f"p.{key} の depts の合計が利用者数・コストと合わない")
    for d in (r for r in rows if r["kind"] == "dept"):
        secs = [r for r in rows if r["kind"] == "section" and r["dept"] == d["dept"]]
        if sum(r["users"] for r in secs) != d["users"] or abs(sum(r["cost"] for r in secs) - d["cost"]) > 0.01:
            sys.exit(f"p.{key} の depts の部 {d['dept']} が課の行の合計と合わない")


def _row(kind: str, dept, section, x: dict, c: dict, long: bool) -> dict:
    users, cost, bd = x["users"], x["cost"], c["bd"]
    row = {"kind": kind, "dept": dept, "section": section, "users": users, "cost": cost,
           "share": round(cost / c["total"] * 100, 1) if c["total"] else None, "per_user_bd": cost / bd / users if users and bd else None}
    if not long:
        row.update(prev=x["prev"], diff=cost - x["prev"], change=round((cost - x["prev"]) / x["prev"] * 100, 1) if x["prev"] else None, over=x["over"])
    return row
