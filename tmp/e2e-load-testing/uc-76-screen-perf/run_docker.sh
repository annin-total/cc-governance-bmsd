#!/bin/bash
# heavy.lock を取り、1 倍の DB を本番の状態に戻して Docker で測り、続けて errors の嵐を足して測る。
# 使い方: run_docker.sh <.local の作業フォルダ>（s100.db と s100.json があること）
set -eu
L="$1"
H="$(cd "$(dirname "$0")" && pwd)"
W="$(cd "$H/../../.." && pwd)"
LOCK=/Users/terasawayuki/Documents/program/Development/bmsd-governance/work/e2e-load-testing/heavy.lock
for i in $(seq 1 10); do mkdir "$LOCK" 2>/dev/null && break; [ "$i" = 10 ] && { echo "lock を取れなかった"; exit 1; }; sleep 180; done
trap 'rmdir "$LOCK"' EXIT

echo "== restore $(date +%T)"
DB_DSN="sqlite:///$L/s100.db" "$L/venv/bin/python" -c "
import sys; sys.path.insert(0, '$W/server')
from ccgov.store import db
db.init(); c = db.connect(); db.analyze(c); c.close()"
echo "== typecheck(host) $(date +%T)"
"$L/venv/bin/python" "$H/typecheck.py" "$W/server" "$L/s100.db" > "$L/typecheck_host.json"
python3 -c "import json;r=json.load(open('$L/typecheck_host.json'));print(r['ok'],r['problems'][:5])"
echo "== docker $(date +%T)"
CC_E2E_RUN=b-uc76 "$W/.venv/bin/python" "$H/docker_run.py" "$L/s100.db" "$L/s100.json" "$L/docker.json"
echo "== storm $(date +%T)"
"$L/venv/bin/python" "$H/storm.py" "$L/s100.db" 7 100000
{ echo "uptime: $(uptime)"; echo "docker: $(docker ps --format '{{.Names}}' | tr '\n' ' ')"; } | tee "$L/storm.env.txt"
"$L/venv/bin/python" "$H/measure.py" "$L/s100.db" "$L/storm.json" --variants analyzed --runs 3
echo "== done $(date +%T)"
