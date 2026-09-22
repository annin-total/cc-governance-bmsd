#!/usr/bin/env python3
"""SCRIPT_NAME によるサブパス対応だけを確かめる最小 Flask アプリ。"""

import os

from flask import Flask, request, url_for

app = Flask(__name__)
BASE_PATH = os.environ.get("BASE_PATH", "")


@app.route("/")
def index():
    return (
        "\n".join(
            [
                f"SCRIPT_NAME={request.environ.get('SCRIPT_NAME', '')!r}",
                f"PATH_INFO={request.environ.get('PATH_INFO', '')!r}",
                f"request.path={request.path!r}",
                f"request.script_root={request.script_root!r}",
                f"url_for('index')={url_for('index')!r}",
                f"url_for('policy')={url_for('policy')!r}",
                f"url_for('static', filename='x.css')={url_for('static', filename='x.css')!r}",
            ]
        )
        + "\n"
    )


@app.route("/policy")
def policy():
    return f"policy ok path={request.path!r} script_root={request.script_root!r}\n"


@app.route("/assets/")
def assets():
    """末尾スラッシュ付きのルート。/assets へのアクセスがどう振る舞うかを見る。"""
    return f"assets ok path={request.path!r}\n"


class ScriptNameMiddleware:
    """設計書 §4.3 の「WSGI ラッパ 1 個」。BASE_PATH を SCRIPT_NAME として与える。"""

    def __init__(self, wsgi_app, base_path):
        self.wsgi_app = wsgi_app
        self.base_path = base_path.rstrip("/")

    def __call__(self, environ, start_response):
        if self.base_path:
            environ["SCRIPT_NAME"] = self.base_path
            path = environ.get("PATH_INFO", "")
            if path.startswith(self.base_path):
                environ["PATH_INFO"] = path[len(self.base_path) :]
        return self.wsgi_app(environ, start_response)


application = ScriptNameMiddleware(app.wsgi_app, BASE_PATH)
app.wsgi_app = application

if __name__ == "__main__":
    from waitress import serve

    serve(app, host="127.0.0.1", port=int(os.environ.get("PORT", "5099")))
