#!/usr/bin/env python3
"""任意の hook の stdin (JSON payload) をファイルにそのまま保存する汎用検証スクリプト。

settings.json の hooks に `python3 capture_hook_stdin.py <hook名>` として仕込み、
圧縮前 (PreCompact) やスキル名 (UserPromptSubmit 等) など、確かめたい hook イベントに
差し替えて使う。argv[1]: hook名（保存ファイル名の接頭辞になるだけで挙動は変えない）。
環境変数 CAPTURE_DIR: 保存先ディレクトリ。
副作用としてファイル保存のみを行い、hook を止めないよう必ず exit 0 する。

隔離 CLAUDE_CONFIG_DIR の settings.json の hooks に、イベントごとに 1 エントリを足す:
  { "hooks": { "PreCompact": [ { "matcher": "*", "hooks": [ { "type": "command",
    "command": "CAPTURE_DIR=\"/path/without/space/captured\" python3 \"/path/to/scripts/capture_hook_stdin.py\" PreCompact" } ] } ] } }

仕込むときの罠:
  - CAPTURE_DIR は command 文字列の中に書く。hook エントリに "env" を付けると、そのエントリが
    無音で無効になる。空白を含むパスは壊れる
  - PostToolUse / PostToolUseFailure は "matcher": "*" が無いと発火しない
  - 1 つの matcher ブロックに複数コマンドを並べると、2 番目以降は実行されない。イベントごとにブロックを分ける
  - settings.json の hooks が claude -p で発火しないことがある。そのときはマーケットプレイスのコピーの
    hooks/hooks.json に仕込む（反映には cache の削除が要る）
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
