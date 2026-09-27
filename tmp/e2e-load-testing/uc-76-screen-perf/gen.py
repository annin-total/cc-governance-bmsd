"""1 年分・200 人の合成データを、サーバの取り込み関数（契約の検査と型変換）を通して SQLite に入れる。

使い方: gen.py <DB パス> <倍率> [--recent-days N --recent-mult M]
events・policy_state・errors は `ndjson.ingest`（/ingest の本体。HTTP と認証だけを省く）、
cost_daily は CSV を書き出して `csv_import.import_all`（/import の本体）で入れる。
"""

import argparse
import csv
import json
import math
import os
import random
import sys
import tempfile
import time
import uuid
from pathlib import Path

SERVER = Path(__file__).resolve().parents[3] / "server"
sys.path.insert(0, str(SERVER))

USERS = 200
DAYS = 365
BASE_EVENTS_PER_ACTIVE_DAY = 80
WEEKDAY_ACTIVE = 0.75
WEEKEND_ACTIVE = 0.10
EVENTS_PER_SESSION = 25
ERROR_RATE = 0.001
CSV_LAG_DAYS = 3
SEED = 76

HOOKS = (  # (hook_event, 重み)
    ("PostToolUse", 70), ("UserPromptSubmit", 12), ("Stop", 10),
    ("PostToolUseFailure", 3), ("PreCompact", 1), ("UserPromptExpansion", 1),
)  # fmt: skip
TOOLS = ("Bash", "Read", "Edit", "Write", "Grep", "Glob", "Skill", "Task", "WebFetch", "TodoWrite")
TOOL_W = (25, 25, 15, 5, 10, 8, 3, 4, 2, 3)
SKILLS = tuple(f"skill-{i:02d}" for i in range(15))
COMMANDS = tuple(f"/cmd-{i:02d}" for i in range(10))
PERM = (("default", 70), ("acceptEdits", 20), ("plan", 5), ("bypassPermissions", 5))
EFFORT = ("low", "medium", "high")
VERSIONS = ((0, "1.0.0"), (90, "1.1.0"), (200, "1.2.0"), (300, "1.3.0"))
REF_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
AUTO_KEY = "extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate"
STAGES = (("collect", "KeyError"), ("send", "OSError"), ("send", "TimeoutError"), ("policy", "JSONDecodeError"))
JST = 9 * 3600


def _pick(rng: random.Random, pairs: tuple) -> str:
    return rng.choices([p[0] for p in pairs], [p[1] for p in pairs])[0]


def _eid(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def _users(rng: random.Random) -> list:
    """利用者ごとの活動量（対数正規・平均 1）・端末・導入日・停止日・非準拠かどうか。"""
    raw = [rng.lognormvariate(0, 0.8) for _ in range(USERS)]
    mean = sum(raw) / USERS
    users = []
    for i in range(USERS):
        late = rng.random() < 0.10
        users.append({
            "email": f"u{i:03d}@example.com",
            "hosts": [f"host-{i:03d}-a"] + ([f"host-{i:03d}-b"] if rng.random() < 0.2 else []),
            "weight": raw[i] / mean,
            "intro": rng.randint(60, 300) if late else rng.randint(0, 59),
            "stop": DAYS - rng.randint(20, 60) if rng.random() < 0.05 else DAYS,
            "noncompliant": rng.random() < 0.10,
            "provider": "aws-bedrock" if rng.random() < 0.85 else "anthropic",
            "lag": rng.randint(0, 15),
        })  # fmt: skip
    return users


def _version(d: int, lag: int) -> str:
    return [v for start, v in VERSIONS if d >= start + lag][-1] if d >= lag else "1.0.0"


def _event(rng, u, host, sid, ts, hook, day0) -> dict:
    row = {"kind": "event", "event_id": _eid(rng), "ts": ts, "user_email": u["email"], "host": host,
           "hook_event": hook, "session_id": sid, "permission_mode": _pick(rng, PERM)}  # fmt: skip
    if hook != "SessionStart":
        row["prompt_id"] = f"p-{sid[:8]}-{ts % 1000}"
    if hook in ("PostToolUse", "PostToolUseFailure"):
        tool = rng.choices(TOOLS, TOOL_W)[0]
        row["tool_name"] = tool
        row["effort_level"] = rng.choice(EFFORT)
        if tool == "Skill":
            row["skill_name"] = rng.choice(SKILLS)
        if rng.random() < 0.15:
            row["agent_id"] = f"agent-{rng.getrandbits(32):08x}"
        if hook == "PostToolUseFailure":
            row["is_interrupt"] = rng.random() < 0.2
    elif hook == "Stop":
        row["effort_level"] = rng.choice(EFFORT)
        row["context_tokens"] = int(rng.lognormvariate(math.log(41545), 0.7))
    elif hook == "PreCompact":
        row["compact_trigger"] = "auto"
        row["context_tokens"] = int(rng.lognormvariate(math.log(120000), 0.3))
    elif hook == "UserPromptExpansion":
        row["command_name"] = rng.choice(COMMANDS)
        row["command_source"] = rng.choice(("builtin", "plugin", "user"))
    return row


def _policy(rng, u, host, ts, d, first: bool) -> list:
    ver = _version(d, u["lag"])
    ref_prev = None if first else ("80" if u["noncompliant"] else "60")
    auto_prev = None if first else "true"
    out = []
    for key, value, prev in ((REF_KEY, "60", ref_prev), (AUTO_KEY, "true", auto_prev)):
        out.append({"kind": "policy", "event_id": _eid(rng), "ts": ts, "user_email": u["email"],
                    "host": host, "key_name": key, "value": value, "prev_value": prev,
                    "apply_result": "unchanged" if prev == value else "applied", "plugin_version": ver})  # fmt: skip
    return out


def _day_rows(rng, users, d, epoch_day, mult, seen_host) -> tuple:
    """1 日分の NDJSON 行と、CSV の行（利用者ごとのコスト）を返す。"""
    lines, cost_rows = [], []
    weekday = (epoch_day + 3) % 7 < 5  # 1970-01-01 は木曜
    for u in users:
        if d < u["intro"] or d >= u["stop"]:
            continue
        if rng.random() >= (WEEKDAY_ACTIVE if weekday else WEEKEND_ACTIVE):
            continue
        n = max(1, round(u["weight"] * BASE_EVENTS_PER_ACTIVE_DAY * mult * rng.uniform(0.5, 1.5)))
        sessions = max(1, min(20, n // EVENTS_PER_SESSION))
        for s in range(sessions):
            host = rng.choice(u["hosts"])
            ts = epoch_day * 86400 - JST + rng.randint(9 * 3600, 19 * 3600)
            sid = _eid(rng)
            lines += _policy(rng, u, host, ts, d, (u["email"], host) not in seen_host)
            seen_host.add((u["email"], host))
            lines.append(_event(rng, u, host, sid, ts, "SessionStart", epoch_day) | {"source": "startup"})
            for k in range(n // sessions):
                ev = _event(rng, u, host, sid, ts + k * 7, _pick(rng, HOOKS), epoch_day)
                lines.append(ev)
                if rng.random() < ERROR_RATE:
                    st, et = rng.choice(STAGES)
                    lines.append({"kind": "error", "event_id": _eid(rng), "ts": ev["ts"], "user_email": u["email"],
                                  "host": host, "hook_event": ev["hook_event"], "plugin_version": _version(d, u["lag"]),
                                  "stage": st, "error_type": et})  # fmt: skip
        cost = rng.lognormvariate(math.log(2.7), 1.2) * u["weight"]
        cost_rows.append((epoch_day, u["email"], u["provider"], cost))
    return lines, cost_rows


def _write_csv(path: Path, rows: list) -> None:
    import datetime

    header = ["Date", "User Email", "Provider", "Model", "Currency", "Cost", "Input Tokens", "Output Tokens",
              "Cache Read Tokens", "Cache Write Tokens", "Cached Input Tokens", "Uncached Input Tokens"]  # fmt: skip
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        for day, email, provider, cost in rows:
            date = (datetime.date(1970, 1, 1) + datetime.timedelta(days=day)).isoformat()
            for model, share in (("model-large", 0.8), ("model-small", 0.2)):
                c = cost * share
                inp = int(c * 3000)
                w.writerow([date, email, provider, model, "USD", f"{c:.6f}", inp, inp // 5, inp * 166, inp * 10, 0, inp])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("db")
    ap.add_argument("mult", type=float)
    ap.add_argument("--recent-days", type=int, default=0)
    ap.add_argument("--recent-mult", type=float, default=1.0)
    a = ap.parse_args()
    os.environ["DB_DSN"] = f"sqlite:///{a.db}"
    from ccgov.ingestion import csv_import, ndjson
    from ccgov.store import db
    from ccgov.vendor.contract import ddl, to_day

    rng = random.Random(SEED)
    users = _users(rng)
    today = to_day(int(time.time()))
    conn = db.connect()
    for stmt in ddl():
        conn.execute(stmt)
    t0 = time.monotonic()
    stored = dropped = 0
    cost_rows: list = []
    seen: set = set()
    for d in range(DAYS):
        epoch_day = today - DAYS + 1 + d
        mult = a.recent_mult if d >= DAYS - a.recent_days else a.mult
        lines, costs = _day_rows(rng, users, d, epoch_day, mult, seen)
        if epoch_day <= today - CSV_LAG_DAYS:
            cost_rows += costs
        raw = "\n".join(json.dumps(x) for x in lines).encode()
        res = ndjson.ingest(raw, conn)
        stored += res["stored"]
        dropped += res["dropped"]
    t_ingest = time.monotonic() - t0
    with tempfile.TemporaryDirectory() as tmp:
        _write_csv(Path(tmp) / "cost.csv", cost_rows)
        t1 = time.monotonic()
        imp = csv_import.import_all(tmp, conn)
        t_csv = time.monotonic() - t1
    conn.close()
    t2 = time.monotonic()
    db.init()  # 契約の列の突き合わせとインデックスの作成（本番の起動時と同じ関数）
    t_index = time.monotonic() - t2
    print(json.dumps({"stored": stored, "dropped": dropped, "csv": imp, "today": today,
                      "sec_ingest": round(t_ingest, 1), "sec_csv": round(t_csv, 1), "sec_index": round(t_index, 1),
                      "bytes": os.path.getsize(a.db)}))  # fmt: skip


if __name__ == "__main__":
    main()
