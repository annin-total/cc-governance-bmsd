"""モジュール 7（サーバ）: Docker イメージ + entry.sh + BASE_PATH で起動した集計サーバに実 TCP で届く。

認証不要・Docker 要。受信・取込・集計の中身は server/tests が見る。ここは起動形態と実 TCP の経路だけを見る。
"""

import csv
import json
import re
import time
import uuid
from collections import defaultdict
from pathlib import Path

import pytest
from _server import BASE_PATH, CSV_DIR, DockerServer, build_context

_SAMPLE_CSV = Path(__file__).resolve().parent / "samples" / "cost_daily.csv"
_PAGES = ("/", "/policy", "/effect", "/assets")
_VENDOR = Path("ccgov") / "vendor" / "contract.py"


def test_BASE_PATH配下で管理画面4つとCSSが返り外は404(server):
    for page in _PAGES:
        status, body, _ = server.request("GET", server.admin_url(page), auth=True)
        assert status == 200, (page, status)
    # 画面が生成する CSS の URL がサブパスを含むこと（SCRIPT_NAME が効いている）
    hrefs = re.findall(r'href="([^"]+\.css)"', body)
    assert hrefs and all(h.startswith(server.admin_url("/")) for h in hrefs), hrefs
    for href in hrefs:
        status, _, ctype = server.request("GET", href, auth=True)
        assert status == 200 and ctype.startswith("text/css"), (href, status, ctype)
    # ADMIN_PATH の外（BASE_PATH の直下とルート）には何も無い
    for outside in (BASE_PATH + "/", "/"):
        assert server.request("GET", outside, auth=True)[0] == 404, outside


def test_ingestはトークンが正しければ保存し誤りなら401(server):
    row = {"kind": "event", "event_id": uuid.uuid4().hex, "ts": int(time.time())}
    body = (json.dumps(row) + "\n").encode()
    url = BASE_PATH + "/ingest"
    status, text, _ = server.request(
        "POST", url, body, {"X-Ingest-Token": server.token}
    )
    assert status == 200, text
    assert json.loads(text) == {"stored": 1, "dropped": 0}
    wrong = {"X-Ingest-Token": server.token + "x"}
    assert server.request("POST", url, body, wrong)[0] == 401


def _sample_rows() -> list:
    with _SAMPLE_CSV.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    assert rows
    return rows


def test_CSV_DIRのCSVを取り込むと概況にコストが出る(server):
    rows = _sample_rows()
    costs: dict = defaultdict(float)
    for r in rows:
        costs[(r["Date"], r["Provider"])] += float(r["Cost"])
    server.put(_SAMPLE_CSV, CSV_DIR)
    status, body, _ = server.request("POST", server.admin_url("/import"), auth=True)
    assert status == 200, body
    assert f"{_SAMPLE_CSV.name}: {len(rows)} 行" in body, body
    status, body, _ = server.request("GET", server.admin_url("/"), auth=True)
    assert status == 200
    for (day, provider), cost in costs.items():
        cell = (
            f'<td class="date">{day}</td><td>{provider}</td>'
            f'<td class="num">${cost:.2f}</td>'
        )
        assert cell in body, cell


def test_契約の複製が1バイト違うと起動しない(root, docker):
    ctx = build_context(root, "tampered")
    vendor = ctx / _VENDOR
    data = vendor.read_bytes()
    assert data.endswith(b"\n")
    vendor.write_bytes(data[:-1] + b" ")
    srv = DockerServer(root, "tampered")
    try:
        srv.start(ctx)
        # 待ち受けたら失敗（raise しない）。止まれば終了時のログが例外に載る
        with pytest.raises(RuntimeError, match=re.escape(_VENDOR.name)):
            srv.wait_ready()
        assert srv.exit_code() == 1
    finally:
        srv.close()
