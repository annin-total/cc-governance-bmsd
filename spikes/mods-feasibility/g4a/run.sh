#!/bin/zsh
# usage: run.sh <tag> <with-cmp:1|0> <claude args...>
# 記録は $S/logs/<tag>/（FEAS_LOG_DIR）、debug は $S/logs/<tag>.debug.log。作業ディレクトリは $S/ws
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4a
G=${0:A:h}
tag=$1; cmp=$2; shift 2
mkdir -p $S/ws $S/logs/$tag
dirs=(--plugin-dir $G/feas-collect)
[[ $cmp == 1 ]] && dirs+=(--plugin-dir $G/feas-cmp)
cd $S/ws
FEAS_LOG_DIR=$S/logs/$tag env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT \
  claude $dirs --model haiku --settings ${FEAS_SETTINGS:-$S/settings.json} --debug-file $S/logs/$tag.debug.log "$@" > $S/logs/$tag.out 2> $S/logs/$tag.err
echo "rc=$?"
