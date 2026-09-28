#!/usr/bin/env python3
"""管理画面 4 画面（/・/policy・/effect・/assets）の表と分布が空にならない合成データを SQLite に作る。

使い方: python3 scripts/seed_dashboard.py <出力する DB> [--users 人数] [--days 日数] [--no-csv]
  出力先が既に在れば上書きせずに止まる。乱数の種は固定。`--no-csv` は CSV（cost_daily）を入れない。
  受信・取込の本体（`/ingest`・`/import` と同じ関数）を通し、行が 1 つでも捨てられたら止まる。
  compose の手動確認へ入れる: `server/` で `docker compose -p ccgov-manual cp <DB> server:<パス>`
  （`<パス>` は `server/dev.env` の `DB_DSN` から `sqlite:///` を除いたもの）
"""

import argparse
import csv
import json
import os
import random
import sys
import tempfile
import time
from pathlib import Path

# 列・施策・期間はサーバの定義をそのまま使う（写しを持つと黙ってずれる）
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from ccgov.constants import (
    EVENT_STUDY_SPAN,
    POLICY_DAYS,
    REFERENCE_KEY,
    REFERENCE_VALUE,
)
from ccgov.ingestion import csv_import, ndjson
from ccgov.store import db
from ccgov.vendor import contract, policy
from seed_dashboard_rows import generate
from seed_dashboard_rules import CSV_RULES, RULES

SEED = 20260928
# 途絶えた端末にも、導入から準拠開始まで EVENT_STUDY_SPAN 日を取れる最短の日数
MIN_DAYS = POLICY_DAYS + EVENT_STUDY_SPAN
MIN_USERS = 10
DEFAULT_DAYS = MIN_DAYS + POLICY_DAYS
DEFAULT_USERS = 40
KINDS = ("event", "policy", "error")


def _contract_names() -> dict:
    return {
        "event": {n for n, _ in contract.EXTRA_COLUMNS}
        | {n for n, _, _ in contract.HOOK_FIELDS},
        "policy": {n for n, _ in contract.POLICY_COLUMNS},
        "error": {n for n, _ in contract.ERROR_COLUMNS},
        "csv": {h for h, _, _ in contract.CSV_COLUMNS if h is not None},
    }


def _check_rules() -> None:
    """対応表と契約の列の食い違い、/effect の基準と施策の食い違いを名指しで止める。"""
    problems = []
    for kind, names in _contract_names().items():
        ruled = set(RULES[kind])
        if names - ruled:
            problems.append(f"{kind} の作り方が無い列: {sorted(names - ruled)}")
        if ruled - names:
            problems.append(f"{kind} の契約に無い列: {sorted(ruled - names)}")
    if contract.policy_text(policy.SET.get(REFERENCE_KEY)) != REFERENCE_VALUE:
        problems.append(f"SET の {REFERENCE_KEY} が REFERENCE_VALUE と違う")
    if problems:
        sys.exit("対応表・施策と契約が食い違う: " + "; ".join(problems))


def _import_csv(costs: list, conn) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        with open(Path(tmp) / "seed.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(CSV_RULES))
            writer.writeheader()
            writer.writerows(costs)
        results = csv_import.import_all(tmp, conn)
    bad = [r for r in results if "error" in r or r.get("dropped")]
    if bad:
        sys.exit(f"CSV の取込で失敗・破棄があった: {bad}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("db")
    parser.add_argument("--users", type=int, default=DEFAULT_USERS)
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS)
    parser.add_argument("--no-csv", action="store_true")
    args = parser.parse_args()
    if args.users < MIN_USERS:
        parser.error(f"--users は {MIN_USERS} 以上")
    if args.days < MIN_DAYS:
        parser.error(f"--days は {MIN_DAYS} 以上")
    return args


def _load(rows: list, costs: list, no_csv: bool) -> None:
    conn = db.connect()
    try:
        # 受信は表を作らない。索引は入れ終えてから db.init() で作る
        for statement in contract.ddl():
            conn.execute(statement)
        raw = "\n".join(json.dumps(r, ensure_ascii=False) for r in rows)
        result = ndjson.ingest(raw.encode("utf-8"), conn)
        if result["dropped"]:
            sys.exit(f"受信で破棄された行がある: {result}")
        if not no_csv:
            _import_csv(costs, conn)
    finally:
        conn.close()
    db.init()


def main() -> None:
    args = _parse_args()
    out = Path(args.db).resolve()
    if out.exists():
        sys.exit(f"出力先が既に在る（上書きしない）: {out}")
    _check_rules()
    os.environ["DB_DSN"] = f"sqlite:///{out}"
    rng = random.Random(SEED)
    rows, costs = generate(rng, args.users, args.days, int(time.time()))
    try:
        _load(rows, costs, args.no_csv)
    except BaseException:
        out.unlink(missing_ok=True)  # 作りかけを残すと、次の実行が「既に在る」で止まる
        raise
    counts = {k: sum(r["kind"] == k for r in rows) for k in KINDS}
    n_cost = 0 if args.no_csv else len(costs)
    print(f"{out}: users={args.users} days={args.days} {counts} cost_daily={n_cost}")


if __name__ == "__main__":
    main()
