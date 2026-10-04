"""合成データの DB から window.DATA（data.js）を作る。今の画面の集計はサーバの report をそのまま呼び、足りない指標は extras*.py が数える。

使い方: python build_data.py --server <server のスナップショット> --scripts <seed の scripts/> --db <seed.db> [--out data.js]
期間のページの窓は利用明細の最終日（E の既定）で終わり、状態のページの窓（`fixed.now`・設定の適用状況）は今日で終わる。
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import tempfile
from pathlib import Path

PERIOD_KEYS = ("7", "28", "12m")
EMAIL = re.compile(r"[\w.+-]+@([\w-]+\.)+\w+")
SAFE_DOMAIN = "@example.com"
FLOAT_DIGITS = 6


def _args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--server", required=True, type=Path)
    p.add_argument("--scripts", required=True, type=Path)
    p.add_argument("--db", required=True, type=Path)
    p.add_argument("--out", type=Path, default=Path(__file__).with_name("data.js"))
    return p.parse_args()


def _reports(conn, today: int, end: int, csv_end) -> dict:
    """今の 4 画面とデータと設定の集計結果（サーバの関数の戻り値そのまま）。期間は `end`（E）で、状態のページの値は今日で終わる。"""
    from ccgov.ingestion import csv_upload
    from ccgov.metrics import windows
    from ccgov.reports import assets, csv_files, effect, export, holidays, overview, policy

    import extras_r4

    p = {}
    for key in PERIOD_KEYS:
        period = windows.period(key, end)
        p[key] = {**overview.build(conn, period), **assets.build(conn, period)}
    with tempfile.TemporaryDirectory() as csv_dir:
        files = csv_files.build(conn, csv_dir, csv_upload.stored(csv_dir))
    fixed = {
        "now": extras_r4.split_state(p, overview.build(conn, windows.period(PERIOD_KEYS[0], today)), csv_end),
        "policy": policy.build(conn, today),
        "effect": effect.build(conn),
        "settings": {"holidays": holidays.build(conn), "files": files, "export": export.build(conn)},
    }
    return {"p": p, "fixed": fixed}


def _round3(raw, data: dict, today: int) -> None:
    """第 3 弾の値を `p[期間].r3` と `fixed.r3` に足す（extras_r3*.py・summaries.py）。状態のページの値は `fixed.now.r3`。"""
    import extras_r3
    import extras_r3_more
    import extras_r3_over
    import extras_r3_policy
    import extras_r4
    import summaries

    csv_end = data["meta"]["csv_end"]
    data["fixed"]["r3"] = {"forecast": extras_r3.forecast(data["p"]["7"]["month"]),
                           "policy": extras_r3_policy.build(raw, today, data["fixed"]["policy"]), "summaries": summaries.build(today, extras_r4.end_of(today, csv_end))}
    for key in PERIOD_KEYS:
        p = data["p"][key]
        long = p["period"]["long"]
        r3 = {"cost": extras_r3.cost(raw, p["x"]["cost"], long), "model_pt": None if long else extras_r3.model_pt(p["x"]["models"], p["x"]["cost"]["prev"])}
        over = {} if long else extras_r3_over.build(raw, key, r3["cost"])
        extras_r3.billed_rows(p["x"]["billed"], over.pop("by_user", {}), long)
        if not long:
            r3["over"] = over
            extras_r3_more.activity_rows(raw, p)
            r3.update(changes=extras_r3_more.changes(p), calls=extras_r3_more.calls(raw, p))
        p["r3"] = r3
    data["fixed"]["r3"]["policy"]["mix"] = extras_r4.mix(data["fixed"]["r3"]["policy"])
    data["fixed"]["now"]["r3"] = extras_r4.now_r3(raw, data["fixed"]["now"], today, csv_end)


def _org(raw, data: dict) -> None:
    """組織 CSV（合成）の部・課を利用者ごとの行に足し、課ごとの集計（`p[期間].r3.sections`）を作る。"""
    import extras_org

    users = [u for (u,) in raw.execute("SELECT user_email FROM events UNION SELECT user_email FROM cost_daily")]
    c = data["p"]["7"]["r3"]["cost"]
    active = [u for (u,) in raw.execute("SELECT DISTINCT user_email FROM cost_daily WHERE day BETWEEN ? AND ? AND cost > 0", (c["start"], c["end"]))]
    data["fixed"]["org"], by = extras_org.roster(len(users), users, active)
    for key in PERIOD_KEYS:
        p = data["p"][key]
        extras_org.annotate(p["x"]["people"], by)
        extras_org.annotate(p["r3"].get("over", {}).get("rows", []), by)
        p["r3"]["sections"] = extras_org.sections(raw, key, p, by)
    extras_org.annotate(data["fixed"]["r3"]["policy"]["users"], by)
    extras_org.annotate(data["fixed"]["now"]["r3"]["silent"]["rows"], by)


def _rounded(v):
    """浮動小数の端数（0.1 + 0.2 の類）を落とし、data.js を読みやすく小さくする。"""
    if isinstance(v, float):
        return round(v, FLOAT_DIGITS)
    if isinstance(v, dict):
        return {k: _rounded(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [_rounded(x) for x in v]
    return v


def _check_emails(text: str) -> None:
    """機微情報の検査: メールは example.com だけ。"""
    bad = {m.group(0) for m in EMAIL.finditer(text) if not m.group(0).endswith(SAFE_DOMAIN)}
    if bad:
        sys.exit(f"example.com 以外のメールが入っている: {sorted(bad)[:5]}")


def main() -> None:
    args = _args()
    sys.path.insert(0, str(args.server.resolve()))
    sys.path.insert(0, str(args.scripts.resolve()))
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    os.environ["DB_DSN"] = f"sqlite:///{args.db.resolve()}"
    from ccgov.constants import REFERENCE_KEY, REFERENCE_VALUE
    from ccgov.store import db, queries_policy

    import extras
    import extras_events
    import extras_more
    import extras_r2
    import extras_r4
    from ccgov.constants import EVENT_STUDY_SPAN

    raw = sqlite3.connect(str(args.db))
    today = raw.execute("SELECT MAX(day) FROM events").fetchone()[0]
    csv_end = raw.execute("SELECT MAX(day) FROM cost_daily").fetchone()[0]
    conn = db.connect()
    try:
        data = _reports(conn, today, extras_r4.end_of(today, csv_end), csv_end)
        starts = queries_policy.compliance_start_dates(conn, REFERENCE_KEY, REFERENCE_VALUE)
    finally:
        conn.close()
    for key in PERIOD_KEYS:
        p = data["p"][key]
        p["x"] = extras.period(raw, p["period"], p["cost"])
        p["m"] = extras_more.period(raw, p["period"], p["x"])
        if key != "12m":
            p.update(extras_r2.period(raw, p["period"], p["x"], extras_events._load))
        extras_r2.lists(p)
    data["p"]["12m"]["m"].update(extras_r2.retention_12m(raw, data["p"]["12m"]["x"]["cost"]))
    data["fixed"]["effect2"] = extras_r2.effect(raw, starts, EVENT_STUDY_SPAN, extras_events._load)
    data["meta"] = extras_r4.meta(raw, today, csv_end, extras.user_count(raw), PERIOD_KEYS)
    _round3(raw, data, today)
    _org(raw, data)
    text = json.dumps(_rounded(data), ensure_ascii=False, default=list, separators=(",", ":"))
    _check_emails(text)
    args.out.write_text("window.DATA = " + text + ";\n", encoding="utf-8")
    print(f"{args.out}: {len(text):,} bytes")


if __name__ == "__main__":
    main()
