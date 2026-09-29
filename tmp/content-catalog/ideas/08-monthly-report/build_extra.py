"""seed の DB から暦月ごとの利用者のコスト（window.DATA.fixed.cal）を作り、data-extra.js に書く。"""
import datetime as dt
import json
import sqlite3
import sys
from collections import defaultdict

EPOCH = dt.date(1970, 1, 1)
TAIL = open(__file__.replace("build_extra.py", "tail.js"), encoding="utf-8").read()


def month_key(day: int) -> int:
    return ((EPOCH + dt.timedelta(days=day)).replace(day=1) - EPOCH).days


def rate(n, d):
    return None if not d else round(n / d * 100, 1)


def main(db: str, outs: list) -> None:
    raw = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    last = raw.execute("SELECT MAX(day) FROM cost_daily").fetchone()[0]
    acc: dict = defaultdict(lambda: defaultdict(lambda: {"cost": 0.0, "days": set(), "models": defaultdict(float),
                                                        "input": 0, "cache_read": 0, "cache_write": 0, "tokens": 0}))
    sql = """SELECT day, user_email, model, cost, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
             FROM cost_daily"""
    for day, email, model, cost, i, o, cr, cw in raw.execute(sql):
        u = acc[month_key(day)][email]
        u["cost"] += cost
        if cost > 0:
            u["days"].add(day)
        u["models"][model] += cost
        u["input"] += i
        u["cache_read"] += cr
        u["cache_write"] += cw
        u["tokens"] += i + o + cr + cw
    keys = sorted(acc)
    rows, months = [], []
    for n, key in enumerate(keys):
        prev = acc[keys[n - 1]] if n else {}
        people = sorted(acc[key].items(), key=lambda kv: -kv[1]["cost"])
        total = sum(u["cost"] for _, u in people) or 1
        cum = 0.0
        mrows = []
        for r, (email, u) in enumerate(people, 1):
            cum += u["cost"]
            p = prev.get(email)
            days = len(u["days"])
            mrows.append({
                "month": key, "email": email, "rank": r, "cost": round(u["cost"], 2), "share": rate(u["cost"], total),
                "cum_share": rate(cum, total), "cost_prev": round(p["cost"], 2) if p else None,
                "cost_diff": round(u["cost"] - p["cost"], 2) if p else None, "days": days,
                "per_day": round(u["cost"] / days, 2) if days else None,
                "top_model": max(u["models"], key=u["models"].get), "tokens": u["tokens"],
                "cache_share": rate(u["cache_read"], u["input"] + u["cache_read"] + u["cache_write"]),
            })
        rows += mrows
        kept = len(set(acc[key]) & set(prev)) if prev else None
        months.append({"day": key, "cost": round(total, 2), "users": len(people), "partial": key == month_key(last),
                       "retention": rate(kept, len(prev)) if prev else None,
                       "top10_share": rate(sum(x["cost"] for x in mrows[:max(1, round(len(mrows) * 0.1))]), total)})
    now, prev = keys[-1], keys[-2]
    cal = {
        "last": last, "months": months, "rows": rows,
        "now": {**months[-1], "people": [r for r in rows if r["month"] == now]},
        "prev": {**months[-2], "people": [r for r in rows if r["month"] == prev]},
    }
    text = json.dumps(cal, ensure_ascii=False, separators=(",", ":"))
    if "@" in text.replace("@example.com", ""):
        sys.exit("example.com 以外のメールが入っている")
    body = ("\"use strict\";\n// 暦月ごとの利用者のコスト（seed の DB から計算。作り方は README）。\n"
            f"window.DATA.fixed.cal = {text};\n" + TAIL)
    for out in outs:
        open(out, "w", encoding="utf-8").write(body)
        print(out, len(body))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
