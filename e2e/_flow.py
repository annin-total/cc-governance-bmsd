"""各モジュールが共有する手順（導入・未ログインのセッション起動・証拠の場所）。"""

import json
from pathlib import Path
from typing import Optional

from _market import MARKETPLACE, PLUGIN_ID, publish

CLI_TIMEOUT = 120
_SESSION_TIMEOUT = 90


def ok(root, *args: str) -> None:
    res = root.run_claude(*args, timeout=CLI_TIMEOUT)
    assert res.returncode == 0, res.stdout + res.stderr


def install(root, gitsrv, ver: str, overrides: Optional[dict] = None) -> None:
    """`ver` を publish し、git source のマーケットプレイスとして追加して導入する。"""
    publish(root, ver, overrides)
    ok(root, "plugin", "marketplace", "add", gitsrv.url(MARKETPLACE), "--scope", "user")
    ok(root, "plugin", "install", PLUGIN_ID, "--scope", "user")


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
