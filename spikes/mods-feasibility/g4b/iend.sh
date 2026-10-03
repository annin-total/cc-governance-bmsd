#!/bin/zsh
# usage: iend.sh <run> <port> <size> [extra env...]  : start TUI, /exit, measure exit time
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4b
run=$1 port=$2 size=$3; shift 3
tmux -L gov4b new-session -d -s $run -x 160 -y 45 "env $* G4B_END=send G4B_URL=http://127.0.0.1:$port/ingest G4B_SIZE=$size $S/tui.sh $run"
for i in {1..50}; do grep -q 'session.start interactive' $S/runs/$run/debug.log 2>/dev/null && break; sleep 0.2; done
sleep 1
tmux -L gov4b send-keys -t $run '/exit'; sleep 0.5; tmux -L gov4b send-keys -t $run Enter
t0=$(date +%s.%N); while tmux -L gov4b has-session -t $run 2>/dev/null; do sleep 0.1; done
echo "$run exit took $(echo "$(date +%s.%N) - $t0" | bc)"
grep -o 'g4b\[.*' $S/runs/$run/debug.log | grep -v 'session.start' | cut -c1-220
grep 'cut at' $S/runs/$run/debug.log | cut -c1-160
