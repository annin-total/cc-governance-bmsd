#!/bin/zsh
# usage: tui.sh <tag> <managed:1|0>   tmux -L gov4e の中で起動する。作業ディレクトリは未信頼の $S/ws-<tag>
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4e
G=${0:A:h}
tag=$1; managed=${2:-0}
dirs=(--plugin-dir $G/feas-native --plugin-dir $G/feas-cmp)
[[ $managed == 1 ]] && dirs+=(--managed-settings '{"permissions":{"deny":["WebFetch"]}}')
mkdir -p $S/ws-$tag $S/logs/$tag
cd $S/ws-$tag
exec env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT \
  FEAS_LOG_DIR=$S/logs/$tag PYTHONDONTWRITEBYTECODE=1 \
  claude $dirs --model haiku --settings $S/settings.json --strict-mcp-config \
  --allowedTools 'Bash(sleep 20)' 'Bash(echo after)' --debug-file $S/logs/$tag.debug.log
