#!/bin/zsh
# 隔離 HOME (home-$n) で Claude Code の対話セッションを pty 上に起動し、指定秒数だけ保持する。
# run.sh を擬似端末経由で叩き、自動更新が TUI にどう表示されるかをログに残す。
n=$1; secs=$2
W="$(cd "$(dirname "$0")" && pwd)"
rm -f $W/in-$n
mkfifo $W/in-$n
# fifo を開いたまま保持するダミー書き込み側
( exec 3> $W/in-$n; sleep $secs ) &
holder=$!
script -q /dev/null $W/run.sh $n < $W/in-$n > $W/tui-$n.log 2>&1 &
cpid=$!
echo "$cpid" > $W/tui-$n.pid
wait $holder
kill -TERM $cpid 2>/dev/null
sleep 2
pkill -TERM -P $cpid 2>/dev/null
rm -f $W/in-$n
