"""検査結果の出力・全体の失敗フラグ・検査で使う subprocess の実行。"""

import subprocess
from typing import Any

FAIL = False


def ok(message: str) -> None:
    print(f"[OK] {message}")


def ng(message: str) -> None:
    """失敗を報告し、全体の失敗フラグを立てる。"""
    global FAIL
    print(f"[NG] {message}")
    FAIL = True


def skip(message: str) -> None:
    print(f"[SKIP] {message}")


def run(argv: list, **kwargs: Any) -> subprocess.CompletedProcess:
    """出力を UTF-8 の文字列で受け取り、終了コードでは例外にしない subprocess.run。"""
    return subprocess.run(
        argv,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        **kwargs,
    )
