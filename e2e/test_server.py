"""モジュール 7（サーバ）: Docker イメージ + entry.sh + BASE_PATH で起動した集計サーバに実 TCP で届く。

認証不要・Docker 要。受信・取込・集計の中身は server/tests が見る。ここは起動形態と実 TCP の経路だけを見る。
"""

import json
import re
import time
import uuid
from pathlib import Path

import pytest
from _server import BASE_PATH, CSV_DIR, DockerServer, build_context, docker

_SAMPLE_CSV = Path(__file__).resolve().parent / "samples" / "cost_daily.csv"
_PAGES = ("/", "/policy", "/effect", "/assets")
_VENDOR = Path("ccgov") / "vendor" / "contract.py"


def test_BASE_PATH配下で管理画面4つとCSSが返り外は404(server):
    for page in _PAGES:
        status, _, _ = server.request("GET", server.admin_path(page), auth=True)
        assert status == 200, (page, status)
    # 画面が生成する CSS の URL がサブパスを含むこと（SCRIPT_NAME が効いている）
    _, body, _ = server.request("GET", server.admin_path("/"), auth=True)
    hrefs = re.findall(r'href="([^"]+\.css)"', body)
    assert hrefs and all(h.startswith(server.admin_path("/")) for h in hrefs), hrefs
    for href in hrefs:
        status, _, ctype = server.request("GET", href, auth=True)
        assert status == 200 and ctype.startswith("text/css"), (href, status, ctype)
    # ADMIN_PATH の外は 404。BASE_PATH 無しの /<ADMIN_PATH>/ は前段のリバースプロキシが除く場合に備えて通る設計なので含めない
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
    assert json.loads(text)["stored"] == 1
    wrong = {"X-Ingest-Token": server.token + "x"}
    assert server.request("POST", url, body, wrong)[0] == 401


def test_CSV_DIRのCSVを取り込むと取込結果が出る(server):
    rows = len(_SAMPLE_CSV.read_text(encoding="utf-8").splitlines()) - 1
    assert rows > 0
    docker("cp", str(_SAMPLE_CSV), f"{server.name}:{CSV_DIR}/{_SAMPLE_CSV.name}")
    status, body, _ = server.request("POST", server.admin_path("/import"), auth=True)
    assert status == 200, body
    assert f"{_SAMPLE_CSV.name}: {rows} 行" in body, body


def test_契約の複製が1バイト違うと起動しない(root, docker_ok):
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
