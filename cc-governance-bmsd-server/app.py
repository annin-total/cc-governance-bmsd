"""ルーティング層。Web フレームワークを import するのはこのファイルだけ。"""

import hmac
import json
import os

import csv_import
import db
import ingest
from flask import Flask, Response, render_template, request

db.init()

app = Flask(__name__)


@app.route("/")
def index() -> str:
    """概況画面。取込ボタンを含む。"""
    return render_template("overview.html")


@app.route("/import", methods=["POST"])
def import_endpoint() -> str:
    """CSV_DIR の全ファイルを取り込み、結果を概況画面に表示する。"""
    conn = db.connect()
    try:
        results = csv_import.import_all(os.environ.get("CSV_DIR", ""), conn)
    finally:
        conn.close()
    return render_template("overview.html", import_results=results)


@app.route("/ingest", methods=["POST"])
def ingest_endpoint() -> Response:
    """NDJSON をトークン検査のうえ `ingest.py` に渡し、保存件数・破棄件数を返す。"""
    token = os.environ.get("INGEST_TOKEN") or ""
    header_token = request.headers.get("X-Ingest-Token") or ""
    if not token or not hmac.compare_digest(
        header_token.encode("latin-1", "replace"),
        token.encode("utf-8", "surrogateescape"),
    ):
        return Response(status=401)

    conn = db.connect()
    try:
        result = ingest.ingest(request.get_data(), conn)
    finally:
        conn.close()
    return Response(
        response=json.dumps(result), status=200, mimetype="application/json"
    )


def _strip_base_path(wsgi_app, base_path: str):
    """`PATH_INFO` が `base_path` で始まっていれば剥がし、`SCRIPT_NAME` に与える。"""

    def _wrapped(environ, start_response):
        if base_path and environ.get("PATH_INFO", "").startswith(base_path):
            environ["PATH_INFO"] = environ["PATH_INFO"][len(base_path) :] or "/"
            environ["SCRIPT_NAME"] = base_path
        return wsgi_app(environ, start_response)

    return _wrapped


app.wsgi_app = _strip_base_path(app.wsgi_app, os.environ.get("BASE_PATH", ""))
