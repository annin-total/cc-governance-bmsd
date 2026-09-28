"""spool を POST する送信プロセス（`python3 _sender.py`）。例外を外に出さない。"""

import http.client
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

import _spool
from collect import append_error

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"

_DEFAULT_CONFIG = {
    "ingest_url": "",
    "ingest_token": "",
    "timeout_sec": 60,
    "spool_max_bytes": _spool.DEFAULT_SPOOL_MAX_BYTES,
    "spool_max_days": _spool.DEFAULT_SPOOL_MAX_DAYS,
}
_STAGE = "send"
# 送信先か受信トークンの誤りで、どのファイルも通らない状態コード
_HALT_STATUSES = frozenset({401, 403, 404})
# 1 回で打ち切ると 1 本の毒ファイルで後続が止まり、打ち切らないとサーバの全体障害を全端末で増幅する
_MAX_CONSECUTIVE_5XX = 2


def _load_config() -> Optional[dict[str, Any]]:
    """`config.json` を読む。読めなければ None。"""
    try:
        with open(_CONFIG_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    return {key: data.get(key, default) for key, default in _DEFAULT_CONFIG.items()}


def _spool_files_sorted() -> list[Path]:
    """spool の `.jsonl` をファイル名（epoch）の昇順で返す。"""
    spool_dir = _spool._spool_dir()
    if not spool_dir.is_dir():
        return []
    return sorted(spool_dir.glob("*.jsonl"))


def _post_body(body: bytes, config: dict[str, Any]) -> Optional[int]:
    """本文を POST して状態コードを返す。サーバに届かなかったら None。"""
    request = urllib.request.Request(
        config["ingest_url"],
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-ndjson",
            "X-Ingest-Token": config["ingest_token"],
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=config["timeout_sec"]) as response:
            return response.status
    except urllib.error.HTTPError as err:
        return err.code
    # 接続不可・タイムアウトは記録しない。SSL の失敗だけは設定か証明書の誤りなので記録する
    except urllib.error.URLError as err:
        if isinstance(err.reason, ssl.SSLError):
            append_error(_STAGE, type(err.reason).__name__, None)
        return None
    # 応答が壊れていると OSError 派生でない HTTPException が出る。逃がすと prune が飛ぶ
    except (OSError, http.client.HTTPException):
        return None


def _post_files(paths: list[Path], config: dict[str, Any]) -> list[int]:
    """古い順に POST して 2xx のファイルを消し、失敗の状態コードを初出順に返す。"""
    failed: list[int] = []
    consecutive_5xx = 0
    for path in paths:
        try:
            body = path.read_bytes()
        except OSError:
            continue
        status = _post_body(body, config)
        # 応答しないサーバに対して、ファイル数 × timeout_sec 粘らない
        if status is None:
            break
        if 200 <= status < 300:
            try:
                os.remove(path)
            except OSError:
                pass
            consecutive_5xx = 0
            continue
        if status not in failed:
            failed.append(status)
        consecutive_5xx = consecutive_5xx + 1 if status >= 500 else 0
        if status in _HALT_STATUSES or consecutive_5xx >= _MAX_CONSECUTIVE_5XX:
            break
    return failed


def run() -> None:
    """退避 → 古い順に POST → 破棄。破棄を後に置き、打ち切らない限り上限超えのファイルにも 1 回は送る。"""
    try:
        config = _load_config()
        if config is None:
            return
        _spool.rotate()
        # 送信先が空でも退避と破棄は行う。行わないと queue.jsonl が上限なしに増える
        paths = _spool_files_sorted() if config["ingest_url"] else []
        # 失敗が続く間に error 行が送信の回数の二乗で増えないよう、状態コードごとに 1 行にする
        for status in _post_files(paths, config):
            append_error(_STAGE, f"HTTP {status}", None)
        _spool.prune(config["spool_max_bytes"], config["spool_max_days"])
    except Exception as e:  # noqa: BLE001 (送信プロセスは例外を外に出さない)
        append_error(_STAGE, type(e).__name__, None)


def launch() -> None:
    """送信プロセスを detach して起動する。待たない。"""
    try:
        subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve())],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError:
        pass


if __name__ == "__main__":
    run()
