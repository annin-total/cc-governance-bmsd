#!/bin/zsh
# usage: run.sh <tag> <with-cmp:1|0> <managed:1|0> <claude args...>
# 記録は $S/logs/<tag>/（FEAS_LOG_DIR）、debug は $S/logs/<tag>.debug.log。作業ディレクトリは $S/ws
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4e
G=${0:A:h}
tag=$1; cmp=$2; managed=$3; shift 3
mkdir -p $S/ws $S/logs/$tag
dirs=(--plugin-dir $G/feas-native)
[[ $cmp == 1 ]] && dirs+=(--plugin-dir $G/feas-cmp)
[[ $managed == 1 ]] && dirs+=(--managed-settings '{"permissions":{"deny":["WebFetch"]}}')
mcp="{\"mcpServers\":{\"feasmcp\":{\"command\":\"python3\",\"args\":[\"$G/mcp_ping.py\"]}}}"
cd $S/ws
FEAS_LOG_DIR=$S/logs/$tag PYTHONDONTWRITEBYTECODE=1 env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT \
  claude $dirs --model haiku --settings $S/settings.json --mcp-config $mcp --strict-mcp-config \
  --debug-file $S/logs/$tag.debug.log "$@" > $S/logs/$tag.out 2> $S/logs/$tag.err
echo "rc=$?"
