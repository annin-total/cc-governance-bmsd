"""ルーティング層。Web フレームワークを import するのはこのファイルだけ。"""

import hmac
import json
import os
import time

import csv_import
import db
import ingest
import queries_policy
import shared
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


def _today() -> int:
    """基準日（epoch 日）を現在時刻から算出する。`queries_*.py` は現在時刻を読まない。"""
    return shared.to_day(int(time.time()))


@app.route("/policy")
def policy_view() -> str:
    """`/policy` 画面。基準日の算出・接続の取得・集計呼び出し・描画・接続の解放だけを行う。"""
    today = _today()
    conn = db.connect()
    try:
        items = []
        for key_name, policy_value in shared.POLICY.items():
            expected_value = shared.coerce(policy_value, "VARCHAR(255)")
            numerator, denominator, rate = queries_policy.compliance_rate(
                conn, today, key_name, expected_value
            )[0]
            items.append(
                {
                    "key_name": key_name,
                    "numerator": numerator,
                    "denominator": denominator,
                    "rate": rate,
                    "non_compliant": queries_policy.non_compliant(
                        conn, today, key_name, expected_value
                    ),
                }
            )
        not_introduced = queries_policy.not_introduced(conn, today)
        stale = queries_policy.stale_terminals(conn, today)
        plugin_versions = queries_policy.plugin_version_distribution(
            conn, today, queries_policy.REFERENCE_KEY
        )
    finally:
        conn.close()
    return render_template(
        "policy.html",
        items=items,
        not_introduced=not_introduced,
        stale=stale,
        plugin_versions=plugin_versions,
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
