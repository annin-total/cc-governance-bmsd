#!/bin/zsh
# usage: tui.sh <tag> <FEAS_SCN>   tmux -L gov4c の中で対話起動する。FEAS_PYWRITE・FEAS_NOPY（比較用プラグインを --plugin-dir で渡さない）は環境から渡す
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4c
G=${0:A:h}
tag=$1; scn=$2
dirs=(--plugin-dir $G/feas-set)
[[ -z $FEAS_NOPY ]] && dirs+=(--plugin-dir $G/feas-py)
mkdir -p $S/ws $S/out/$tag $S/logs
cd $S/ws
exec env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT \
  CLAUDE_CONFIG_DIR=$S/cfg FEAS_OUT=$S/out/$tag FEAS_SCN=$scn FEAS_PYWRITE=${FEAS_PYWRITE:-0} \
  claude $dirs --debug-file $S/logs/$tag.debug.log
