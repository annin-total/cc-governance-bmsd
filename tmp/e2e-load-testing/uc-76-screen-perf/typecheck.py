"""DB の列と値の記憶型（typeof）が契約どおりかを検査する。標準ライブラリだけ（コンテナの python3.9 でも動く）。

使い方: typecheck.py <ccgov の親ディレクトリ> <DB> [event_id の一覧ファイル]
一覧を渡すと、その event_id の行（/ingest 経由）とそれ以外（直接投入）を分けて集計する。
出力: {"ok": bool, "problems": [...], "typeof": {表: {列: {群: {記憶型: 件数}}}}}
"""

import json
import sqlite3
import sys

sys.path.insert(0, sys.argv[1])
from ccgov.vendor.contract import CSV_COLUMNS, ERROR_COLUMNS, EXTRA_COLUMNS, HOOK_FIELDS, POLICY_COLUMNS  # noqa: E402

_ALLOWED = {"VARCHAR": {"text", "null"}, "INTEGER": {"integer", "null"}, "BIGINT": {"integer", "null"}, "DOUBLE": {"real", "null"}}
_TABLES = {
    "events": tuple(EXTRA_COLUMNS) + tuple((n, t) for n, _, t in HOOK_FIELDS),
    "policy_state": tuple(POLICY_COLUMNS),
    "errors": tuple(ERROR_COLUMNS),
    "cost_daily": tuple((n, t) for _, n, t in CSV_COLUMNS),
}
_REQUIRED_NOT_NULL = {"event_id", "ts", "day"}


def check(db: str, ids=None) -> dict:
    conn = sqlite3.connect(db)
    if ids is not None:
        conn.execute("CREATE TEMP TABLE via_ingest (event_id TEXT PRIMARY KEY)")
        conn.executemany("INSERT INTO via_ingest VALUES (?)", [(i,) for i in ids])
    problems, report = [], {}
    for table, cols in _TABLES.items():
        actual = [(r[1], r[2]) for r in conn.execute(f"PRAGMA table_info({table})")]
        if actual != list(cols):
            problems.append(f"{table}: 列の並びか型が契約と違う {actual}")
        group = "'all'"
        if ids is not None and table != "cost_daily":
            group = "CASE WHEN event_id IN (SELECT event_id FROM via_ingest) THEN 'ingest' ELSE 'direct' END"
        report[table] = {}
        for name, type_str in cols:
            rows = conn.execute(f"SELECT {group}, typeof({name}), COUNT(*) FROM {table} GROUP BY 1, 2").fetchall()
            per: dict = {}
            for g, t, n in rows:
                per.setdefault(g, {})[t] = n
                if t not in _ALLOWED[type_str.split("(")[0]]:
                    problems.append(f"{table}.{name}: {g} に {t} が {n} 件")
                if t == "null" and name in _REQUIRED_NOT_NULL and table != "cost_daily":
                    problems.append(f"{table}.{name}: {g} に NULL が {n} 件")
            report[table][name] = per
    conn.close()
    return {"ok": not problems, "problems": problems, "typeof": report}


if __name__ == "__main__":
    ids = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else None
    print(json.dumps(check(sys.argv[2], ids), ensure_ascii=False))
