#!/bin/bash
# 追加の本番: 一斉起動の N=15 と、0.5 秒間隔で順に起動する N=20・30（heavy.lock を取り、必ず返す）
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
echo "LOCK_ACQUIRED $(date)"
cd "$W/tmp/e2e-load-testing/uc-14-concurrent-write"
CC_E2E_RUN=a "$W/.venv/bin/python" run.py claude "$L/extra-burst15.json" 15 15
echo "BURST_DONE rc=$? $(date)"
UC14_STAGGER=0.5 CC_E2E_RUN=a "$W/.venv/bin/python" run.py claude "$L/extra-stagger.json" 20 30
echo "STAGGER_DONE rc=$? $(date)"
