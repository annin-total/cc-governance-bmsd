"""4 画面を Flask の test_client で描画まで通して計時し、画面ごとのクエリの内訳と EXPLAIN QUERY PLAN を取る。

使い方: measure.py <DB パス> <出力 JSON> [--variants analyzed,no_stat,no_index] [--runs 5] [--deadline 300]
- analyzed: インデックスあり + `db.analyze`（本番と同じ analysis_limit=400）
- no_stat: インデックスあり + sqlite_stat1 を消す（ANALYZE 前）
- no_index: ix_* を DROP + sqlite_stat1 を消す
1 リクエスト（1 接続）が --deadline 秒を超えたら progress handler で打ち切り、その画面は timeout と記録する。
"""

import argparse
import json
import os
import re
import sqlite3
import statistics
import sys
import time
from pathlib import Path

SERVER = Path(__file__).resolve().parents[3] / "server"
sys.path.insert(0, str(SERVER))
ADMIN = "adm"
PASSWORD = "pw"
SCREENS = ("/", "/policy", "/effect", "/assets")
_FULL_SCAN = re.compile(r"\bSCAN (events|policy_state|errors|cost_daily)\b(?! USING)")


class _Cur:
    """execute から fetch までの時間を SQL ごとに記録するカーソル。"""

    def __init__(self, cur, log):
        self._c, self._log = cur, log

    def execute(self, sql, params=()):
        t = time.perf_counter()
        self._c.execute(sql, params)
        self._rec = {"sql": sql, "params": list(params), "sec": time.perf_counter() - t}
        self._log.append(self._rec)
        return self

    def _timed(self, fn):
        t = time.perf_counter()
        out = fn()
        self._rec["sec"] += time.perf_counter() - t
        return out

    def fetchall(self):
        return self._timed(self._c.fetchall)

    def fetchone(self):
        return self._timed(self._c.fetchone)


class _Conn:
    def __init__(self, conn, log):
        self._c, self._log = conn, log

    def cursor(self):
        return _Cur(self._c.cursor(), self._log)

    def __getattr__(self, name):
        return getattr(self._c, name)


def _install(db, path: str, log: list, deadline_sec: float) -> None:
    def connect():
        conn = sqlite3.connect(path)
        limit = time.monotonic() + deadline_sec
        conn.set_progress_handler(lambda: 1 if time.monotonic() > limit else 0, 100000)
        return _Conn(conn, log)

    db.connect = connect


def _apply_variant(path: str, variant: str, db) -> None:
    raw = sqlite3.connect(path)
    raw.execute("DROP TABLE IF EXISTS sqlite_stat1")
    raw.commit()
    if variant == "analyzed":
        db.analyze(raw)
    elif variant == "no_index":
        for (name,) in raw.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'").fetchall():
            raw.execute(f"DROP INDEX {name}")
        raw.commit()
    raw.close()


def _plans(path: str, log: list) -> list:
    """SQL ごとに 1 回だけ EXPLAIN QUERY PLAN を取り、全表走査の有無を付ける。"""
    raw = sqlite3.connect(path)
    seen, out = set(), []
    for rec in log:
        if rec["sql"] in seen:
            continue
        seen.add(rec["sql"])
        plan = [r[3] for r in raw.execute("EXPLAIN QUERY PLAN " + rec["sql"], rec["params"]).fetchall()]
        out.append({"sql": rec["sql"], "params": rec["params"], "plan": plan, "full_scan": [p for p in plan if _FULL_SCAN.search(p)]})
    raw.close()
    return out


def _summary(log: list) -> list:
    """同じ SQL の回数と合計時間（多い順に上位 8 本）。"""
    agg: dict = {}
    for rec in log:
        a = agg.setdefault(rec["sql"], [0, 0.0])
        a[0] += 1
        a[1] += rec["sec"]
    top = sorted(agg.items(), key=lambda kv: -kv[1][1])[:8]
    return [{"sql": s[:160], "calls": c, "sec": round(t, 3)} for s, (c, t) in top]


def _gate(path: str, html: str, today: int) -> dict:
    """概況の「直近 7 日のイベント件数」が独立に数えた件数と一致して描画されているか。"""
    raw = sqlite3.connect(path)
    (n,) = raw.execute("SELECT COUNT(DISTINCT event_id) FROM events WHERE day BETWEEN ? AND ?", (today - 6, today)).fetchone()
    raw.close()
    return {"recent_events": n, "rendered": f"{n:,}" in html}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("db")
    ap.add_argument("out")
    ap.add_argument("--variants", default="analyzed,no_stat,no_index")
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--deadline", type=float, default=300)
    a = ap.parse_args()
    os.environ["DB_DSN"] = f"sqlite:///{a.db}"
    from ccgov.config import Config
    from ccgov.store import db
    from ccgov.vendor.contract import to_day
    from ccgov.web import create_app

    app = create_app(Config(admin_path=ADMIN, admin_password=PASSWORD, ingest_token="t", base_path="", csv_dir=""))
    app.config["PROPAGATE_EXCEPTIONS"] = True
    client = app.test_client()
    auth = {"Authorization": "Basic " + __import__("base64").b64encode(f"x:{PASSWORD}".encode()).decode()}
    today = to_day(int(time.time()))
    result = {"sqlite": sqlite3.sqlite_version, "today": today, "variants": {}}
    for variant in a.variants.split(","):
        _apply_variant(a.db, variant, db)
        vres = {}
        for screen in SCREENS:
            times, log, status = [], [], None
            for i in range(a.runs):
                log.clear()
                _install(db, a.db, log, a.deadline)
                t = time.perf_counter()
                try:
                    res = client.get(f"/{ADMIN}{screen}", headers=auth)
                    status = res.status_code
                    body = res.get_data(as_text=True)
                except sqlite3.OperationalError as e:
                    status, body = f"timeout({e})", ""
                times.append(time.perf_counter() - t)
                if status != 200:
                    break
            entry = {"status": status, "sec": [round(x, 3) for x in times],
                     "median": round(statistics.median(times), 3), "queries": len(log), "top": _summary(log)}  # fmt: skip
            if screen == "/" and status == 200:
                entry["gate"] = _gate(a.db, body, today)
            entry["plans"] = _plans(a.db, log)
            vres[screen] = entry
            print(variant, screen, status, entry["median"], len(log), flush=True)
        result["variants"][variant] = vres
    Path(a.out).write_text(json.dumps(result, ensure_ascii=False, indent=1), "utf-8")


if __name__ == "__main__":
    main()
