"""UC55-1 の判定: 端末ごとに、送った行（控え）と DB の行を event_id で突き合わせる。

`--break` は (1) 誤った期待と (2) DB の改竄の両方で判定が落ちることを確かめる（緑を鵜呑みにしない）。
"""

import argparse
import json
import shutil
import sqlite3
import sys
from pathlib import Path

_TABLES = {"event": "events", "policy": "policy_state", "error": "errors"}
# 端末 -> (NULL を強いられる列, 黙って捨てられる列, 1 行も届かない kind)
EXPECT = {
    "minus1": ({"permission_mode"}, set(), set()),
    "plus1": (set(), {"hook_event_name_x"}, set()),
    "renamed": ({"tool_name"}, {"tool"}, set()),
    "ts_renamed": ({"ts"}, {"timestamp"}, {"event"}),
    "new": (set(), set(), set()),
}
_WRONG = dict(EXPECT, minus1=(set(), set(), set()), ts_renamed=(set(), set(), set()))


def observe(conn, rows: list) -> tuple:
    """(NULL を強いられた列, 捨てられた列, 届かなかった kind, 値の不一致) を返す。"""
    forced, dropped, missing, mismatch = set(), set(), set(), []
    for kind, table in _TABLES.items():
        mine = [r for r in rows if r["kind"] == kind]
        if not mine:
            continue
        cols = [c[1] for c in conn.execute(f"PRAGMA table_info({table})")]
        got = {}
        for r in mine:
            cur = conn.execute(
                f"SELECT * FROM {table} WHERE event_id = ?", (r["event_id"],)
            )
            for x in cur:
                got[r["event_id"]] = dict(zip(cols, x))
        if not got:
            missing.add(kind)
            forced |= {c for c in cols if c not in mine[0]}  # 仮に届いていたら
            dropped |= set(mine[0]) - set(cols) - {"kind"}
            continue
        if len(got) != len(mine):
            mismatch.append((kind, "届いた件数", len(got), len(mine)))
        for r in mine:
            db = got.get(r["event_id"])
            if db is None:
                continue
            forced |= {c for c in cols if c not in r}
            dropped |= set(r) - set(cols) - {"kind"}
            for c in cols:
                want = r.get(c)
                if c == "day" and c not in r:
                    continue  # サーバが ts から計算する
                if db[c] != want:
                    mismatch.append((kind, c, db[c], want))
    return forced, dropped, missing, mismatch


def judge(db: Path, sent: dict, expect: dict) -> list:
    conn = sqlite3.connect(db)
    fails = []
    for name, rows in sent.items():
        forced, dropped, missing, mismatch = observe(conn, rows)
        print(f"{name}: 行 {len(rows)} / NULL化 {sorted(forced)} / 捨て {sorted(dropped)}"
              f" / 未着 {sorted(missing)} / 不一致 {mismatch[:3]}")  # fmt: skip
        if (forced, dropped, missing) != expect[name] or mismatch:
            fails.append(name)
    return fails


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--break", dest="brk", action="store_true")
    a = ap.parse_args()
    sent = json.loads((a.out / "sent_rows.json").read_text())
    db = a.out / "db" / "data" / "e2e.db"
    fails = judge(db, sent, EXPECT)
    print("判定:", "合格" if not fails else f"不合格 {fails}")
    if not a.brk:
        sys.exit(1 if fails else 0)
    print("--- 壊した期待（minus1 は NULL 無し・ts_renamed は全部届く）")
    wrong = judge(db, sent, _WRONG)
    assert set(wrong) >= {"minus1", "ts_renamed"}, wrong
    print("--- 改竄した DB（minus1 の 1 行に permission_mode を入れる）")
    tampered = a.out / "tampered.db"
    shutil.copy(db, tampered)
    eid = next(r["event_id"] for r in sent["minus1"] if r["kind"] == "event")
    with sqlite3.connect(tampered) as c:
        c.execute(
            "UPDATE events SET permission_mode='default' WHERE event_id=?", (eid,)
        )
    bad = judge(tampered, sent, EXPECT)
    tampered.unlink()
    assert "minus1" in bad, bad
    print("壊した条件で落ちた: ゲートしている")


if __name__ == "__main__":
    main()
