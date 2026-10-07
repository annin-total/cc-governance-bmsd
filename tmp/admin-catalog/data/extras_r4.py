"""第 4 弾から移した値: 状態のページの窓（今日まで）・メタ（カレンダーの日）。"""

import judge
import extras_r3_more

STATE_KEYS = ("users", "events", "errors", "nulls", "health", "reconciliation")  # 状態のページの値（overview.build のキー）
CSV_LAG = 2  # 利用明細が 1 件も無いとき、期間の終わりを今日の何日前にするか
PICK_AFTER = 27  # 選べる最初の日は、利用明細の最初の日の何日後か
MATCH_DAYS = 7  # match7: 突き合わせは利用明細の最終日までの 7 日（サーバの reconciliation_counts と同じ）


def end_of(today: int, csv_end) -> int:
    """期間のページの終わり（E の既定）。利用明細の最終日、無ければ今日の CSV_LAG 日前。"""
    return today - CSV_LAG if csv_end is None else csv_end


def split_state(p: dict, state: dict, csv_end) -> dict:
    """期間のページの値から状態のキーを外し、今日までの 7 日の値（`state`）と突き合わせの窓（`match`。利用明細の最終日までの 7 日）を `fixed.now` に置く。"""
    for v in p.values():
        for k in STATE_KEYS:
            v.pop(k, None)
    match = None if csv_end is None else {"start": csv_end - MATCH_DAYS + 1, "end": csv_end}
    return {"period": state["period"], "match": match, **{k: state[k] for k in STATE_KEYS}}


def now_r3(raw, now: dict, today: int, csv_end: int) -> dict:
    """`fixed.now.r3`: 途絶えた利用者・エラー・欠けの状態・受信の増減と送信した利用者。"""
    per = now["period"]
    senders = raw.execute("SELECT COUNT(DISTINCT user_email) FROM events WHERE day BETWEEN ? AND ?", (per["start"], per["end"])).fetchone()[0]
    return {"silent": extras_r3_more.silent(raw, today, csv_end), "errors": extras_r3_more.errors(raw, now), "nulls": extras_r3_more.nulls(now),
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

