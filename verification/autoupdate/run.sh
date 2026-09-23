#!/bin/zsh
# 隔離 HOME (home-<n>) で claude を起動するラッパ。第1引数は home 名（a/b）、以降が claude の引数。
# home-<n>/ は実行のたびに用意する作業データなので、このリポジトリには含まれない。
n=$1; shift
W="$(cd "$(dirname "$0")" && pwd)"
H=$W/home-$n
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || echo "$HOME/.local/bin/claude")}"
cd $H/proj
exec env -u CLAUDECODE -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT \
  -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID \
  -u CLAUDE_EFFORT -u CLAUDE_AUTOCOMPACT_PCT_OVERRIDE -u AI_AGENT -u FORCE_AUTOUPDATE_PLUGINS -u DISABLE_AUTOUPDATER \
  HOME="$H" "$CLAUDE_BIN" "$@"
