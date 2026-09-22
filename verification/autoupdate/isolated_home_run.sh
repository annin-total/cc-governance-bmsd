#!/bin/zsh
# 隔離 HOME で claude を起動し、プラグインのデータ領域（~/.claude 配下）が
# どこにどう作られるかを確かめるラッパ。home/proj/ は実行のたびに用意する作業データ
# なので、このリポジトリには含まれない（自分で用意する）。
W="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || echo "$HOME/.local/bin/claude")}"
cd $W/home/proj
exec env -u CLAUDECODE -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT \
  -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID \
  -u CLAUDE_EFFORT -u CLAUDE_AUTOCOMPACT_PCT_OVERRIDE -u AI_AGENT \
  HOME="$W/home" "$CLAUDE_BIN" "$@"
