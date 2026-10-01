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


def _multipart(fields: dict, name: str, data: bytes) -> tuple:
    """`fields` と `file` 1 つの multipart/form-data の (本文, Content-Type)。"""
    boundary = uuid.uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        for k, v in fields.items()
    ]
    head = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
        f'filename="{name}"\r\nContent-Type: text/csv\r\n\r\n'
    )
    body = b"".join(parts) + head.encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def test_データと設定の画面でCSVを受け取るとCSV_DIRに置いて取り込む(server):
    data = _SAMPLE_CSV.read_bytes()
    rows = len(data.decode("utf-8").splitlines()) - 1
    assert rows > 0
    _, page, _ = server.request("GET", server.admin_path("/settings"), auth=True)
    # 画面が生成するフォームの送り先がサブパスを含むこと（CSS と同じく SCRIPT_NAME が効いている）
    action = re.search(r'action="([^"]+)" enctype="multipart/form-data"', page)
    assert action and action[1].startswith(server.admin_path("/")), page
    token = re.search(r'name="csrf" value="([^"]+)"', page)
    assert token, page
    body, ctype = _multipart({"csrf": token[1]}, _SAMPLE_CSV.name, data)
    status, text, _ = server.request(
        "POST", action[1], body, {"Content-Type": ctype}, auth=True
    )
    assert status == 200, text
    assert f"{_SAMPLE_CSV.name}: {rows} 行" in text, text
    docker("exec", server.name, "test", "-f", f"{CSV_DIR}/{_SAMPLE_CSV.name}")


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
