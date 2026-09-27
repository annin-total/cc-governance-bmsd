"""導入直後の 1 回目の未ログインセッションで、SessionStart の適用が抜けることがあるかを数える。"""

import json
import sys
import time

from uc06_lib import data_dir, env, install, ov, policy_rows, policy_src, real_leaks, session, version

N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
out = []
for i in range(N):
    with env() as (root, srv):
        install(root, srv, version(1), ov(policy_src(add={"permissions.deny": ["Read(./x)"]})))
        t = time.monotonic()
        lines = session(root)
        dt = round(time.monotonic() - t, 1)
        rows = policy_rows(root)
        hooks = [
            (m.get("subtype"), m.get("hook_name") or m.get("hook_event"), m.get("exit_code"), m.get("outcome"))
            for m in lines if m.get("type") == "system" and "hook" in str(m.get("subtype"))
        ]
        rec = {"i": i, "sec": dt, "policy_rows": len(rows), "hooks": hooks, "data_files": sorted(p.name for p in data_dir(root).rglob("*"))}
        if not rows:
            rec["stream"] = lines
        out.append(rec)
        print(json.dumps({k: v for k, v in rec.items() if k != "stream"}, ensure_ascii=False), flush=True)
print("missing:", sum(1 for r in out if not r["policy_rows"]), "/", N, "leaks:", real_leaks())
open(sys.argv[2] if len(sys.argv) > 2 else "/dev/null", "w").write(json.dumps(out, ensure_ascii=False, indent=1))
