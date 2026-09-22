#!/usr/bin/env python3
"""hook の systemMessage 出力が、指定文字数でどこまで届く／切り詰められるかを確かめる。

環境変数 NOTICE_LEN で長さ、NOTICE_MODE (ascii|ja) で ASCII/日本語を切り替えて
{"systemMessage": ...} を標準出力に書く。hook の出力として使い、実際の Claude Code の
画面・ログでどこまで表示されたかを目視で確認する（お知らせ機能の長さ上限の実地検証）。
"""

import json
import os
import sys


def build_message(length: int) -> str:
    """指定文字数のメッセージを組み立てる。

    先頭 [BEGIN-<length>]、末尾 [END-<length>]、間は100文字ごとに
    |NNNN| という通し番号入りの充填文字列にする。
    切り詰めが起きた場合、どこで切られたかが番号でわかる。
    """
    begin = f"[BEGIN-{length}]"
    end = f"[END-{length}]"
    if length <= len(begin) + len(end):
        return (begin + end)[:length]

    fill_len = length - len(begin) - len(end)
    fill_parts = []
    filled = 0
    counter = 0
    while filled < fill_len:
        marker = f"|{counter:04d}|"
        remaining = fill_len - filled
        if len(marker) > remaining:
            marker = marker[:remaining]
        fill_parts.append(marker)
        filled += len(marker)
        counter += 100
    fill = "".join(fill_parts)
    return begin + fill + end


def build_message_ja(length: int) -> str:
    """日本語（マルチバイト）文字で指定文字数のメッセージを組み立てる。"""
    begin = f"[開始-{length}]"
    end = f"[終了-{length}]"
    if length <= len(begin) + len(end):
        return (begin + end)[:length]
    fill_len = length - len(begin) - len(end)
    # 全角文字1文字を単位に、10文字ごとに番号を挟む
    body = ""
    counter = 0
    while len(body) < fill_len:
        marker = f"あ{counter:04d}"
        body += marker
        counter += 1
    body = body[:fill_len]
    return begin + body + end


def main() -> int:
    length = int(os.environ.get("NOTICE_LEN", "100"))
    mode = os.environ.get("NOTICE_MODE", "ascii")
    if mode == "ja":
        msg = build_message_ja(length)
    else:
        msg = build_message(length)
    sys.stdout.write(json.dumps({"systemMessage": msg}, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
