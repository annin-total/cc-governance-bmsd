"""seed の DB から window.DATA（data.js）を作る。今の画面の集計はサーバの report をそのまま呼び、足りない指標は extras.py が数える。

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
    from ccgov.metrics import compliance
    from ccgov.store import db, queries_policy
    from ccgov.vendor import policy

    import extras
    import extras_more

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
    data["fixed"]["x"] = extras.fixed(raw, today, data["fixed"]["policy"])
    data["fixed"]["m"] = extras_more.fixed(raw, today, compliance.targets(policy.SET), starts)
    data["meta"] = {"asof": today, "periods": list(PERIOD_KEYS), "users": extras.user_count(raw)}
    text = json.dumps(_rounded(data), ensure_ascii=False, default=list, separators=(",", ":"))
    _check_emails(text)
    args.out.write_text("window.DATA = " + text + ";\n", encoding="utf-8")
    print(f"{args.out}: {len(text):,} bytes")


if __name__ == "__main__":
    main()
