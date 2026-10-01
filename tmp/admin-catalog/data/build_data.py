"""合成データの DB から window.DATA（data.js）を作る。今の画面の集計はサーバの report をそのまま呼び、足りない指標は extras*.py が数える。

使い方: python build_data.py --server <server のスナップショット> --db <seed.db> [--out data.js]
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
    p.add_argument("--db", required=True, type=Path)
    p.add_argument("--out", type=Path, default=Path(__file__).with_name("data.js"))
    return p.parse_args()


def _reports(conn, today: int) -> dict:
    """今の 4 画面とデータと設定の集計結果（サーバの関数の戻り値そのまま）。"""
    from ccgov.ingestion import csv_upload
    from ccgov.metrics import windows
    from ccgov.reports import assets, csv_files, effect, export, holidays, overview, policy

    p = {}
    for key in PERIOD_KEYS:
        period = windows.period(key, today)
        p[key] = {**overview.build(conn, period), **assets.build(conn, period)}
    with tempfile.TemporaryDirectory() as csv_dir:
        files = csv_files.build(conn, csv_dir, csv_upload.stored(csv_dir))
    fixed = {
        "policy": policy.build(conn, today),
        "effect": effect.build(conn),
        "settings": {"holidays": holidays.build(conn), "files": files, "export": export.build(conn)},
    }
    return {"p": p, "fixed": fixed}


def _round3(raw, data: dict, today: int) -> None:
    """第 3 弾の値を `p[期間].r3` と `fixed.r3` に足す（extras_r3*.py・summaries.py）。"""
    import extras_r3
    import extras_r3_more
    import extras_r3_policy
    import summaries

    csv_end = data["fixed"]["m"]["csv_end"]
    limit = extras_r3.limit(raw, csv_end)
    data["fixed"]["r3"] = {"limit": limit, "forecast": extras_r3.forecast(data["p"]["7"]["month"]),
                           "policy": extras_r3_policy.build(raw, today, data["fixed"]["policy"]), "summaries": summaries.build(today)}
    for key in PERIOD_KEYS:
        p = data["p"][key]
        long = p["period"]["long"]
        extras_r3.billed_rows(p["x"]["billed"], limit["by_user"], long)
        r3 = {"cost": extras_r3.cost(raw, p["x"]["cost"], long), "model_pt": None if long else extras_r3.model_pt(p["x"]["models"], p["x"]["cost"]["prev"])}
        if not long:
            extras_r3_more.activity_rows(raw, p)
            r3.update(changes=extras_r3_more.changes(p), calls=extras_r3_more.calls(raw, p))
        p["r3"] = r3
    data["p"]["7"]["r3"].update(silent=extras_r3_more.silent(raw, today, csv_end), errors=extras_r3_more.errors(raw, data["p"]["7"]),
                                nulls=extras_r3_more.nulls(data["p"]["7"]))


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
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    os.environ["DB_DSN"] = f"sqlite:///{args.db.resolve()}"
    from ccgov.constants import REFERENCE_KEY, REFERENCE_VALUE
    from ccgov.store import db, queries_policy

    import extras
    import extras_events
    import extras_more
    import extras_r2
    from ccgov.constants import EVENT_STUDY_SPAN

    raw = sqlite3.connect(str(args.db))
    today = raw.execute("SELECT MAX(day) FROM events").fetchone()[0]
    conn = db.connect()
    try:
        data = _reports(conn, today)
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
    data["fixed"]["m"] = extras_more.fixed(raw, today)
    data["fixed"]["effect2"] = extras_r2.effect(raw, starts, EVENT_STUDY_SPAN, extras_events._load)
    _round3(raw, data, today)
    first_day = raw.execute("SELECT MIN(day) FROM cost_daily").fetchone()[0]
    data["meta"] = {"asof": today, "first_day": first_day, "periods": list(PERIOD_KEYS), "users": extras.user_count(raw)}
    text = json.dumps(_rounded(data), ensure_ascii=False, default=list, separators=(",", ":"))
    _check_emails(text)
    args.out.write_text("window.DATA = " + text + ";\n", encoding="utf-8")
    print(f"{args.out}: {len(text):,} bytes")


if __name__ == "__main__":
    main()
