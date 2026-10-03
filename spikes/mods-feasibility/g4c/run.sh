#!/bin/zsh
# usage: run.sh <tag> <FEAS_SCN> [claude args...]   非対話で 1 回起動する。FEAS_PYWRITE は環境から渡す
# 隔離 CLAUDE_CONFIG_DIR は $S/cfg、記録は $S/out/<tag>/、debug は $S/logs/<tag>.debug.log
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4c
G=${0:A:h}
tag=$1; scn=$2; shift 2
mkdir -p $S/ws $S/out/$tag $S/logs $S/cfg
cd $S/ws
FEAS_BIGMIX=${FEAS_BIGMIX:-0} FEAS_BIGN=${FEAS_BIGN:-3500000} FEAS_ROUNDS=${FEAS_ROUNDS:-10} CLAUDE_CONFIG_DIR=$S/cfg FEAS_OUT=$S/out/$tag FEAS_SCN=$scn FEAS_PYWRITE=${FEAS_PYWRITE:-0} \
  env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT \
  claude --plugin-dir $G/feas-set --plugin-dir $G/feas-py --debug-file $S/logs/$tag.debug.log "$@" < /dev/null > $S/logs/$tag.out 2> $S/logs/$tag.err
echo "rc=$?"
