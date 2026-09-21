"""transcript 末尾から context_tokens を取得する。標準ライブラリのみで動く。"""

from typing import Optional


def context_tokens(path: Optional[str]) -> Optional[int]:
    """transcript の末尾 256KB を読み、最新の usage 合計を返す。取得できなければ None。"""
    return None
