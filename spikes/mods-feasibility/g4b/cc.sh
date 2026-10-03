#!/bin/sh
# usage: cc.sh <runname> <prompt> [extra env assignments via env before]
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4b
R=$S/runs/$1; mkdir -p "$R"; shift
cd "$S"
exec env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT \
  CLAUDE_CONFIG_DIR=$S/cfg G4B_OUT="$R" G4B_SENDER=$S/sender.py \
  claude -p "$1" --plugin-dir $S/mod --debug-file "$R/debug.log" --output-format json </dev/null
