"""第 4 弾で足す値: 状態のページの窓（今日まで）・メタ（カレンダーの日）・設定の適用のまとめ・エラーの上位。"""

import sys

import judge
import extras_r3_more

STATE_KEYS = ("users", "events", "errors", "nulls", "health", "reconciliation")  # 状態のページの値（overview.build のキー）
CSV_LAG = 2  # 利用明細が 1 件も無いとき、期間の終わりを今日の何日前にするか
PICK_AFTER = 27  # 選べる最初の日は、利用明細の最初の日の何日後か
TOP_ERRORS = 3


def end_of(today: int, csv_end) -> int:
    """期間のページの終わり（E の既定）。利用明細の最終日、無ければ今日の CSV_LAG 日前。"""
    return today - CSV_LAG if csv_end is None else csv_end


def split_state(p: dict, state: dict) -> dict:
    """期間のページの値から状態のキーを外し、今日までの 7 日の値（`state`）だけを `fixed.now` に置く。"""
    for v in p.values():
        for k in STATE_KEYS:
            v.pop(k, None)
    return {"period": state["period"], **{k: state[k] for k in STATE_KEYS}}


def now_r3(raw, now: dict, today: int, csv_end: int) -> dict:
    """`fixed.now.r3`: 途絶えた利用者・エラー（上位 3 つ）・欠けの状態・受信の増減と送信した利用者。"""
    per = now["period"]
    senders = raw.execute("SELECT COUNT(DISTINCT user_email) FROM events WHERE day BETWEEN ? AND ?", (per["start"], per["end"])).fetchone()[0]
    errors = extras_r3_more.errors(raw, now)
    errors["top"] = [{k: r[k] for k in ("stage", "error_type", "count")} for r in sorted(errors["rows"], key=lambda r: -r["count"])[:TOP_ERRORS]]
    return {"silent": extras_r3_more.silent(raw, today, csv_end), "errors": errors, "nulls": extras_r3_more.nulls(now),
            "changes": {"events": judge.change(now["events"]["recent"], now["events"]["prev"]), "senders": senders}}


def meta(raw, today: int, csv_end, users: int, periods: tuple) -> dict:
    """今日・利用明細の最終日・選べる最初の日と、日ごとの「利用明細の行がある」「記録がある」（カレンダーの 3 つの見せ方）。"""
    first = raw.execute("SELECT MIN(day) FROM cost_daily").fetchone()[0]
    csv_days = {d for (d,) in raw.execute("SELECT DISTINCT day FROM cost_daily")}
    rec_days = {d for (d,) in raw.execute("SELECT DISTINCT day FROM events")}
    start = first if first is not None else min(rec_days | {today})
    return {"today": today, "csv_end": csv_end, "end": end_of(today, csv_end), "first_day": first,
            "first_pick": None if first is None else first + PICK_AFTER, "csv_stale_days": judge.CSV_STALE_DAYS,
            "days": [{"day": d, "csv": d in csv_days, "rec": d in rec_days} for d in range(start, today + 1)],
            "periods": list(periods), "users": users}


def mix(policy: dict) -> dict:
    """`applied_mix`: すべて適用・未適用・未導入の 3 区分。排他で、合計は対象の人数に一致する（合わなければ止める）。"""
    c = policy["counts"]
    total = c["ok"] + c["off"] + c["none"]
    if total != policy["denominator"]:
        sys.exit(f"applied_mix の 3 区分の合計 {total} が対象 {policy['denominator']} 人と合わない")
    return {"ok": c["ok"], "off": c["off"], "none": c["none"], "total": total}
