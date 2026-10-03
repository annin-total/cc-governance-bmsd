# run.sh・tui.sh が source する共通の起動環境。隔離 config・偽の open を PATH の先頭に・本体の自動更新と不要な通信を止める
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4d
G=${0:A:h}
mkdir -p $S/bin $S/logs $S/ws && cp $G/fake-open.sh $S/bin/open
CLEAN=(env -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN
  -u CLAUDE_CODE_BRIDGE_SESSION_ID -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT
  CLAUDE_CONFIG_DIR=$S/cfg PATH=$S/bin:$PATH G4D_OPEN_LOG=$S/open.log PYTHONDONTWRITEBYTECODE=1
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_AUTOUPDATER=1)
