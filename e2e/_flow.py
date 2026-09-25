"""各モジュールが共有する手順（導入・送信先の設定・セッション起動・証拠の場所）。"""

import json
from pathlib import Path
from typing import Optional

from _market import MARKETPLACE, PLUGIN_ID, PLUGIN_SRC, publish
from _server import BASE_PATH

_CLI_TIMEOUT = 120
_SESSION_TIMEOUT = 90
_ASK_TIMEOUT = 300
# 応答しない送信先で送信プロセスが片付けの後まで残らないように短くする
_SEND_TIMEOUT_SEC = 5


def ok(root, *args: str) -> None:
    res = root.run_claude(*args, timeout=_CLI_TIMEOUT)
    assert res.returncode == 0, res.stdout + res.stderr


def install(root, gitsrv, ver: str, overrides: Optional[dict] = None) -> None:
    """`ver` を publish し、git source のマーケットプレイスとして追加して導入する。"""
    publish(root, ver, overrides)
    # user に入れる。policy.py の autoUpdate は、利用者の settings.json の
    # extraKnownMarketplaces に項目が在るときだけ書かれる
    ok(root, "plugin", "marketplace", "add", gitsrv.url(MARKETPLACE), "--scope", "user")
    ok(root, "plugin", "install", PLUGIN_ID, "--scope", "user")


def ingest_config(port: int, token: str) -> dict:
    """送信先を 127.0.0.1:`port` の集計サーバにした config.json の上書き（install の overrides）。"""
    cfg = json.loads((PLUGIN_SRC / "config.json").read_text(encoding="utf-8"))
    cfg.update(
        ingest_url=f"http://127.0.0.1:{port}{BASE_PATH}/ingest",
        ingest_token=token,
        timeout_sec=_SEND_TIMEOUT_SEC,
    )
    return {"config.json": json.dumps(cfg).encode()}


def ask(root, *args: str, model: str, tools: tuple = ()) -> None:
    """認証付きで `claude -p` を 1 回動かす。ツールは `tools` だけ許す。"""
    allow = ("--allowedTools", *tools) if tools else ()
    res = root.run_claude(
        "-p", *args, "--model", model, *allow, timeout=_ASK_TIMEOUT, auth=True
    )  # fmt: skip
    assert res.returncode == 0, res.stdout[-2000:] + res.stderr[-2000:]


def session(root, extra_env: Optional[dict] = None) -> list:
    """未ログインで 1 セッション起動し、stream-json の出力行を返す。

    未ログインでは終了コード 1 で終わるが、SessionStart は発火する。終了コードは判定しない。
    """
    res = root.run_claude(
        "-p", "ok", "--output-format", "stream-json", "--verbose",
        timeout=_SESSION_TIMEOUT, extra_env=extra_env,
    )  # fmt: skip
    return [json.loads(line) for line in res.stdout.splitlines() if line.strip()]


def data_dir(root) -> Path:
    """プラグインの data ディレクトリ（1 つだけ在ること）。"""
    dirs = list((root.config / "plugins" / "data").iterdir())
    assert len(dirs) == 1, dirs
    return dirs[0]


def install_path(root) -> Path:
    """installed_plugins.json が記録する、このプラグインの installPath。"""
    recorded = root.json("plugins/installed_plugins.json")["plugins"][PLUGIN_ID]
    assert len(recorded) == 1, recorded
    return Path(recorded[0]["installPath"])
