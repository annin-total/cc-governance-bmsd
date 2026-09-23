#!/usr/bin/env python3
"""events テーブルの COUNT(DISTINCT event_id) を被覆インデックスあり/なしで計測する。

規模: 1 日 50,000 行 × DAYS 日。空きディスクの制約で年間 1,500 万行は作れないため、
画面が実際に投げる「day で絞った窓」のクエリを同じ密度で計測する。
"""

import os
import random
import sqlite3
import sys
import time
import uuid

DB = sys.argv[1]
DAYS = int(sys.argv[2])
PER_DAY = int(sys.argv[3])
DAY0 = 20300

DDL = """
CREATE TABLE events (
  event_id VARCHAR(36), ts INTEGER, day INTEGER,
  user_email VARCHAR(255), host VARCHAR(255), hook_event VARCHAR(64),
  session_id VARCHAR(255), prompt_id VARCHAR(255), tool_name VARCHAR(255),
  source VARCHAR(255), compact_trigger VARCHAR(255), command_name VARCHAR(255),
  command_source VARCHAR(255), skill_name VARCHAR(255), effort_level VARCHAR(255),
  permission_mode VARCHAR(255), agent_id VARCHAR(255),
  is_interrupt INTEGER, context_tokens INTEGER
);
"""
IDX = [
    "CREATE INDEX ix1 ON events(day, user_email, event_id)",
    "CREATE INDEX ix2 ON events(skill_name, day, user_email, event_id)",
    "CREATE INDEX ix3 ON events(tool_name, day, user_email, event_id)",
    "CREATE INDEX ix4 ON events(day, hook_event, context_tokens)",
]

USERS = [f"user{i:03d}@example.co.jp" for i in range(140)]
HOOKS = [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "PreCompact",
    "SessionEnd",
]
TOOLS = ["Read", "Edit", "Bash", "Grep", "Glob", "Write", "Task", None]
SKILLS = [None] * 9 + ["brainstorming", "systematic-debugging", "gov:notice"]
MODES = ["default", "acceptEdits", "bypassPermissions", "plan"]


def build(db):
    if os.path.exists(db):
        os.remove(db)
    c = sqlite3.connect(db)
    c.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;")
    c.executescript(DDL)
    rnd = random.Random(42)
    t0 = time.time()
    for d in range(DAYS):
        day = DAY0 + d
        rows = []
        for _ in range(PER_DAY):
            hook = rnd.choice(HOOKS)
            rows.append(
                (
                    str(uuid.uuid4()),
                    day * 86400 + rnd.randrange(86400),
                    day,
                    rnd.choice(USERS),
                    f"host{rnd.randrange(160):03d}",
                    hook,
                    str(uuid.uuid4()),
                    str(uuid.uuid4()),
                    rnd.choice(TOOLS)
                    if hook in ("PreToolUse", "PostToolUse")
                    else None,
                    "startup" if hook == "SessionStart" else None,
                    "auto" if hook == "PreCompact" else None,
                    None,
                    None,
                    rnd.choice(SKILLS),
                    "high",
                    rnd.choice(MODES),
                    None,
                    rnd.randrange(2),
                    rnd.randrange(20000, 180000)
                    if hook in ("PreCompact", "Stop")
                    else None,
                )
            )
        c.executemany("INSERT INTO events VALUES (" + ",".join(["?"] * 19) + ")", rows)
    c.commit()
    print(
        f"build: {DAYS * PER_DAY:,} 行 / {time.time() - t0:.1f}s / {os.path.getsize(db) / 2**20:.0f}MiB"
    )
    return c


QUERIES = {
    "1日 件数(日次推移)": (
        "SELECT day, COUNT(DISTINCT event_id) FROM events WHERE day BETWEEN ? AND ? GROUP BY day",
        1,
    ),
    "30日 件数(日次推移)": (
        "SELECT day, COUNT(DISTINCT event_id) FROM events WHERE day BETWEEN ? AND ? GROUP BY day",
        30,
    ),
    "30日 利用者数": (
        "SELECT day, COUNT(DISTINCT user_email) FROM events WHERE day BETWEEN ? AND ? GROUP BY day",
        30,
    ),
    "30日 スキル別": (
        "SELECT skill_name, COUNT(DISTINCT event_id) FROM events WHERE skill_name IS NOT NULL AND day BETWEEN ? AND ? GROUP BY skill_name",
        30,
    ),
    "30日 ツール分布": (
        "SELECT tool_name, COUNT(DISTINCT event_id) FROM events WHERE tool_name IS NOT NULL AND day BETWEEN ? AND ? GROUP BY tool_name",
        30,
    ),
    "30日 コンテキスト分布": (
        "SELECT context_tokens FROM events WHERE hook_event='PreCompact' AND day BETWEEN ? AND ? AND context_tokens IS NOT NULL",
        30,
    ),
    "全期間 件数(禁じ手)": (
        "SELECT COUNT(DISTINCT event_id) FROM events WHERE day BETWEEN ? AND ?",
        DAYS,
    ),
}


def measure(c, label):
    print(f"\n=== {label} ===")
    for name, (sql, span) in QUERIES.items():
        lo = DAY0 + DAYS - span
        hi = DAY0 + DAYS - 1
        best = None
        for _ in range(3):
            t = time.time()
            c.execute(sql, (lo, hi)).fetchall()
            e = time.time() - t
            best = e if best is None else min(best, e)
        print(f"  {name:24s} {best * 1000:8.1f} ms")


if __name__ == "__main__":
    c = build(DB)
    measure(c, "インデックスなし")
    t0 = time.time()
    for s in IDX:
        c.execute(s)
    c.commit()
    print(
        f"\nインデックス作成: {time.time() - t0:.1f}s / DB {os.path.getsize(DB) / 2**20:.0f}MiB"
    )
    measure(c, "被覆インデックスあり")
