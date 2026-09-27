#!/bin/bash
# heavy.lock を取り、倍率ごとに DB を作って測り、消す。使い方: run_host.sh <.local の作業フォルダ>
set -eu
L="$1"
H="$(cd "$(dirname "$0")" && pwd)"
PY="$L/venv/bin/python"
LOCK=/Users/terasawayuki/Documents/program/Development/bmsd-governance/work/e2e-load-testing/heavy.lock
for i in $(seq 1 10); do mkdir "$LOCK" 2>/dev/null && break; [ "$i" = 10 ] && { echo "lock を取れなかった"; exit 1; }; sleep 180; done
trap 'rmdir "$LOCK"' EXIT

run() {  # run <名前> <gen の引数...> -- <measure の引数...>
  name="$1"; shift
  gargs=(); while [ "$1" != "--" ]; do gargs+=("$1"); shift; done; shift
  rm -f "$L/$name.db"
  echo "== $name gen $(date +%T)"; "$PY" "$H/gen.py" "$L/$name.db" "${gargs[@]}" | tee "$L/$name.gen.json"
  { echo "uptime: $(uptime)"; echo "docker: $(docker ps --format '{{.Names}}' | tr '\n' ' ')"; } | tee "$L/$name.env.txt"
  echo "== $name measure $(date +%T)"; "$PY" "$H/measure.py" "$L/$name.db" "$L/$name.json" "$@"
}

run s050 0.5 -- --variants analyzed,no_stat
rm -f "$L/s050.db"
run s100 1 -- --variants analyzed,no_stat,no_index --deadline 120
run s200 2 -- --variants analyzed,no_stat
rm -f "$L/s200.db"
run s100r5 1 --recent-days 35 --recent-mult 5 -- --variants analyzed,no_stat
rm -f "$L/s100r5.db"
echo "== done $(date +%T)"
