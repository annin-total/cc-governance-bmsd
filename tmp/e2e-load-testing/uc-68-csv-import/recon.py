"""No.70: 突合率を意図的に下げ、画面・ログから原因（合わない利用者）を追えるかを見る。"""

import sys
from pathlib import Path

sys.path[:0] = [
    str(Path(__file__).resolve().parents[3] / "e2e"),
    str(Path(__file__).resolve().parent),
]

import json
import re
import uuid
from datetime import datetime, timedelta, timezone

from _server import BASE_PATH
from lab import (
    JULY,
    csv_sum,
    db_summary,
    do_import,
    place,
    query,
    read_rows,
    reset,
    to_bytes,
)

_JST = timezone(timedelta(hours=9))
_PAGES = ("/", "/policy", "/effect", "/assets")
_TILE = re.compile(r"([\d.,]+)\s*/\s*([\d.,]+)\s*人")


def _send(srv, emails: list, when: datetime) -> dict:
    body = b"".join(
        (json.dumps({"kind": "event", "event_id": uuid.uuid4().hex, "ts": int(when.timestamp()),
                     "session_id": f"uc68-{uuid.uuid4().hex[:8]}", "hook_event": "Stop",
                     "user_email": e}) + "\n").encode()
        for e in emails
    )  # fmt: skip
    st, text, _ = srv.request(
        "POST", BASE_PATH + "/ingest", body, {"X-Ingest-Token": srv.token}
    )
    return {"status": st, **json.loads(text)}


def _tile(srv) -> tuple:
    _, body, _ = srv.request("GET", srv.admin_path("/"), auth=True)
    m = _TILE.search(body)
    return (m.group(1), m.group(2)) if m else None


def recon_cases(srv) -> list:
    rows = read_rows(JULY)
    di, ei = rows[0].index("Date"), rows[0].index("User Email")
    recent = sorted({r[ei] for r in rows[1:] if r[di] >= "2026-07-25"})
    when = datetime(2026, 7, 29, 12, tzinfo=_JST)
    reset(srv)
    place(srv, "recon", {"jul.csv": to_bytes(rows)})
    do_import(srv)
    matched = recent[:20]
    alias = [e.split("@")[0] + "@alias.example.invalid" for e in recent[20:25]]
    upper = [e.upper() for e in recent[25:28]]
    steps = [
        ("match_20", matched, ("20", "20")),
        ("alias_5", alias, ("20", "25")),
        ("upper_3", upper, ("20", "28")),
    ]
    out = []
    for name, emails, want in steps:
        sent = _send(srv, emails, when)
        tile = _tile(srv)
        miss = [] if tile == want else [f"tile {tile} != {want}"]
        out.append({"name": f"recon_{name}", "sent": sent, "tile": tile, "miss": miss})
        print(f"{'OK ' if not miss else 'NG '}recon_{name}: tile={tile} {miss}")
    # 画面・ログに「合わない利用者」が出るか（出た回数を数えるだけ。値は書かない）
    shown = {}
    for page in _PAGES:
        _, body, _ = srv.request("GET", srv.admin_path(page), auth=True)
        shown[page] = sum(body.count(e) for e in alias + upper)
    logs = srv.logs()
    unmatched_sql = query(
        srv,
        "SELECT COUNT(DISTINCT user_email) FROM events WHERE user_email NOT IN (SELECT user_email FROM cost_daily WHERE user_email IS NOT NULL)",
    )[0][0]
    lower_hit = query(
        srv,
        "SELECT COUNT(DISTINCT e.user_email) FROM events e WHERE e.user_email NOT IN (SELECT user_email FROM cost_daily) AND LOWER(e.user_email) IN (SELECT user_email FROM cost_daily)",
    )[0][0]
    out.append({
        "name": "recon_trace", "unmatched_on_pages": shown, "unmatched_in_logs": sum(logs.count(e) for e in alias + upper),
        "unmatched_by_sql": unmatched_sql, "case_only_mismatch_by_sql": lower_hit, "miss": [] if unmatched_sql == 8 else ["sql"],
        "csv_rows": csv_sum(rows)[0], "db": db_summary(srv),
    })  # fmt: skip
    print(
        f"recon_trace: pages={shown} sql_unmatched={unmatched_sql} case_only={lower_hit}"
    )
    return out
