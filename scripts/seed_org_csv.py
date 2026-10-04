#!/usr/bin/env python3
"""組織 CSV（組織と業務メールアドレス）の合成データを書き出す。DB には触れない。

使い方: python3 scripts/seed_org_csv.py --out <パス> [--users 人数]
  `--users` を `seed_dashboard.py` と同じにすると、メールが利用ログ・明細の合成利用者と揃う。乱数の種は固定。
"""

import argparse
import random
from pathlib import Path

# seed_dashboard を先に読む（server/ を import の経路に足す）
from seed_dashboard import DEFAULT_USERS, MIN_USERS, SEED, write_csv
from seed_dashboard_rows import roster
from seed_org_columns import ORG_RULES


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--users", type=int, default=DEFAULT_USERS)
    args = parser.parse_args()
    if args.users < MIN_USERS:
        parser.error(f"--users は {MIN_USERS} 以上")
    rows = roster(random.Random(SEED), args.users)
    write_csv(args.out, ORG_RULES, rows)
    print(f"users={args.users} roster={len(rows)} out={args.out}")


if __name__ == "__main__":
    main()
