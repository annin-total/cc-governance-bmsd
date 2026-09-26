#!/usr/bin/env python3
"""任意の hook の stdin (JSON payload) をファイルにそのまま保存する汎用検証スクリプト。

settings.json の hooks に `python3 capture_hook_stdin.py <hook名>` として仕込み、
圧縮前 (PreCompact) やスキル名 (UserPromptSubmit 等) など、確かめたい hook イベントに
差し替えて使う。argv[1]: hook名（保存ファイル名の接頭辞になるだけで挙動は変えない）。
環境変数 CAPTURE_DIR: 保存先ディレクトリ。
副作用としてファイル保存のみを行い、hook を止めないよう必ず exit 0 する。
CAPTURE_DIR は command 文字列の中に書く（`CAPTURE_DIR="<repo>/scripts/captured" python3 ...`）。
hook エントリの "env" は無言で無視され、claude の作業ディレクトリに保存される（2.1.283 で確認）。
"""

import os
import sys
import time


def main():
    hook_name = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    capture_dir = os.environ.get("CAPTURE_DIR", ".")
    os.makedirs(capture_dir, exist_ok=True)
    data = sys.stdin.read()
    ts = int(time.time() * 1000)
    pid = os.getpid()
    path = os.path.join(capture_dir, f"{hook_name}-{ts}-{pid}.json")
    with open(path, "w") as f:
        f.write(data)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)
