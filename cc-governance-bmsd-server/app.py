"""ルーティング層。Web フレームワークを import するのはこのファイルだけ。"""

import os

import db
from flask import Flask

db.init()

app = Flask(__name__)


@app.route("/")
def index() -> str:
    """疎通確認用の応答。"""
    return "ok"


def _strip_base_path(wsgi_app, base_path: str):
    """`PATH_INFO` が `base_path` で始まっていれば剥がし、`SCRIPT_NAME` に与える。"""

    def _wrapped(environ, start_response):
        if base_path and environ.get("PATH_INFO", "").startswith(base_path):
            environ["PATH_INFO"] = environ["PATH_INFO"][len(base_path) :]
            environ["SCRIPT_NAME"] = base_path
        return wsgi_app(environ, start_response)

    return _wrapped


app.wsgi_app = _strip_base_path(app.wsgi_app, os.environ.get("BASE_PATH", ""))
