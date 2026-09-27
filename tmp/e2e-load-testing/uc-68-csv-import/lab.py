"""UC68 の共通部品: サーバへの CSV の配置・取込・DB の問い合わせ・CSV の変形。実データは .local にだけ書く。"""

import csv
import html
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path[:0] = [str(REPO / "e2e"), str(HERE)]

from _server import _DB, CSV_DIR, DockerServer, docker

DATA = REPO.parents[1] / "cc-governance" / "data"
OUT = (
    REPO.parents[1]
    / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-68-csv-import"
)
STAGE = OUT / "stage"
JULY = next(DATA.glob("202607_*.csv"))
AUG = next(DATA.glob("202608_*.csv"))
_OK = re.compile(r'<p class="ok-box">(.+?): ([\d,]+) 行（破棄 ([\d,]+) 件）</p>')
_ERR = re.compile(r'<p class="err">(.+?): 失敗（(.*?)）</p>', re.DOTALL)
_QUERY = (
    "import json,sqlite3,sys;c=sqlite3.connect(sys.argv[1]);"
    "print(json.dumps(c.execute(sys.argv[2]).fetchall()))"
)
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def read_rows(path: Path) -> list:
    """ヘッダを含む全行（list of list）。"""
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


def to_bytes(rows: list, encoding: str = "utf-8", newline: str = "\r\n") -> bytes:
    buf = io.StringIO()
    csv.writer(buf, lineterminator=newline).writerows(rows)
    return buf.getvalue().encode(encoding)


def query(srv: DockerServer, sql: str) -> list:
    res = docker("exec", srv.name, "python3", "-c", _QUERY, _DB, sql, timeout=600)
    return json.loads(res.stdout)


def reset(srv: DockerServer) -> None:
    """CSV_DIR を空にし、cost_daily と events を消す。"""
    docker("exec", srv.name, "sh", "-c", f"mkdir -p {CSV_DIR} && rm -rf {CSV_DIR}/*")
    code = "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('DELETE FROM cost_daily');c.execute('DELETE FROM events');c.commit()"
    docker("exec", srv.name, "python3", "-c", code, _DB)


def place(srv: DockerServer, case: str, files: dict) -> None:
    """`files`（名前 → bytes）を CSV_DIR に置く。既存のファイルは消さない。"""
    d = STAGE / case
    d.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (d / name).write_bytes(data)
        docker("cp", str(d / name), f"{srv.name}:{CSV_DIR}/{name}", timeout=600)


def unplace(srv: DockerServer, name: str) -> None:
    docker("exec", srv.name, "rm", "-f", f"{CSV_DIR}/{name}")


def do_import(srv: DockerServer, timeout: float = 30) -> dict:
    """取込ボタンと同じ POST。画面に出た結果（ok / err）と所要時間を返す。"""
    cred = __import__("base64").b64encode(f"e2e:{srv._password}".encode()).decode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{srv.port}{srv.admin_path('/import')}", data=b"",
        headers={"Authorization": f"Basic {cred}"}, method="POST",
    )  # fmt: skip
    t0 = time.monotonic()
    try:
        with _OPENER.open(req, timeout=timeout) as res:
            status, body = res.status, res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        status, body = e.code, e.read().decode("utf-8", "replace")
    sec = time.monotonic() - t0
    ok = [
        (html.unescape(f), int(r.replace(",", "")), int(d.replace(",", "")))
        for f, r, d in _OK.findall(body)
    ]
    err = [(html.unescape(f), html.unescape(m)) for f, m in _ERR.findall(body)]
    return {
        "status": status,
        "sec": round(sec, 3),
        "ok": ok,
        "err": err,
        "bytes": len(body),
    }


def db_summary(srv: DockerServer) -> dict:
    """件数・コスト合計・NULL の数・日の数（値そのものは返さない）。"""
    n, cost, days, users = query(
        srv,
        "SELECT COUNT(*), SUM(cost), COUNT(DISTINCT day), COUNT(DISTINCT user_email) FROM cost_daily",
    )[0]
    nulls = query(
        srv,
        "SELECT SUM(cost IS NULL), SUM(user_email IS NULL), SUM(input_tokens IS NULL), SUM(model IS NULL) FROM cost_daily",
    )[0]
    keys = ("cost", "user_email", "input_tokens", "model")
    return {"rows": n, "cost": cost, "days": days, "users": users,
            "nulls": dict(zip(keys, nulls)) if n else {}}  # fmt: skip


def csv_sum(rows: list) -> tuple:
    """(データ行数, Cost の合計) を CSV 側で数える。"""
    i = rows[0].index("Cost")
    return len(rows) - 1, sum(float(r[i]) for r in rows[1:])
