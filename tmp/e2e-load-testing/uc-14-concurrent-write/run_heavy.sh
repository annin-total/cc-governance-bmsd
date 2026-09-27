#!/bin/bash
# heavy.lock を最長 90 分待って取り、本番（claude 10→20→30、hook 60→100）を流して必ず返す。
set -u
W=/Users/terasawayuki/Documents/program/Development/bmsd-governance/work/wt-a
L=/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/cc-governance-bmsd/.local/e2e-load-testing/uc-14-concurrent-write
LOCK=/Users/terasawayuki/Documents/program/Development/bmsd-governance/work/e2e-load-testing/heavy.lock
DEADLINE=$(( $(date +%s) + 90*60 ))
until mkdir "$LOCK" 2>/dev/null; do
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then echo "LOCK_TIMEOUT $(date)"; exit 3; fi
  sleep 120
done
trap 'rmdir "$LOCK" && echo "LOCK_RELEASED $(date)"' EXIT INT TERM
echo "LOCK_ACQUIRED $(date) load=$(sysctl -n vm.loadavg)"
cd "$W/tmp/e2e-load-testing/uc-14-concurrent-write"
CC_E2E_RUN=a "$W/.venv/bin/python" run.py claude "$L/main-claude.json" 10 20 30
echo "CLAUDE_DONE rc=$? $(date)"
CC_E2E_RUN=a "$W/.venv/bin/python" run.py hook "$L/main-hook.json" 60 100
echo "HOOK_DONE rc=$? $(date)"
