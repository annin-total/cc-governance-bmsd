#!/bin/sh
# usage: tui2.sh <runname> <settings.json か -> <plugin-dir>...  (対話。SessionEnd 延長の環境変数は外す)
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4b
R=$S/runs/$1; mkdir -p "$R"; ST=$2; shift 2
A=""; for d in "$@"; do A="$A --plugin-dir $d"; done
[ "$ST" != "-" ] && A="$A --settings $ST"
cd "$S"
exec env -u CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS -u G4B_EXTEND_END_MS -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT \
  CLAUDE_CONFIG_DIR=$S/cfg G4B_OUT="$R" claude $A --debug-file "$R/debug.log"
