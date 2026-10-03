#!/bin/zsh
# usage: tui.sh <tag> [both|cmp|mod]   tmux -L gov4a の中で起動する。作業ディレクトリは未信頼の $S/ws-<tag>
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4a
G=${0:A:h}
tag=$1; set=${2:-both}
dirs=()
[[ $set != cmp ]] && dirs+=(--plugin-dir $G/feas-collect)
[[ $set != mod ]] && dirs+=(--plugin-dir $G/feas-cmp)
mkdir -p $S/ws-$tag $S/logs/$tag
cd $S/ws-$tag
exec env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT FEAS_LOG_DIR=$S/logs/$tag \
  claude $dirs --model haiku --settings $S/settings.json \
  --allowedTools 'Bash(sleep 20)' --debug-file $S/logs/$tag.debug.log
