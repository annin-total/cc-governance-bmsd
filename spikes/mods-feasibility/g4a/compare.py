"""logs/<tag>/ の mod 側と command 側の記録を、イベントごとに順に突き合わせる。usage: compare.py <log_dir>"""

import json
import os
import sys
from collections import Counter, defaultdict

PATHS = {
    "session_id": ("session_id",), "prompt_id": ("prompt_id",), "tool_name": ("tool_name",),
    "source": ("source",), "trigger": ("trigger",), "command_name": ("command_name",),
    "command_source": ("command_source",), "skill": ("tool_input", "skill"), "effort": ("effort", "level"),
    "permission_mode": ("permission_mode",), "agent_id": ("agent_id",), "is_interrupt": ("is_interrupt",),
    "transcript_path": ("transcript_path",),
}


def _dig(obj, path):
    for k in path:
        if not isinstance(obj, dict) or k not in obj:
            return "<absent>"
        obj = obj[k]
    return obj


def _load(d):
    recs = []
    for name in sorted(os.listdir(d)):
        with open(os.path.join(d, name), encoding="utf-8") as f:
            r = json.loads(f.read())
        if r["side"] == "cmd":
            r["e"] = json.loads(r.pop("raw"))
        recs.append(r)
    return sorted(recs, key=lambda r: (r["at"], r.get("seq", 0)))


def main(d):
    recs = _load(d)
    by = defaultdict(lambda: defaultdict(list))
    for r in recs:
        if "e" in r:
            by[r["ev"]][r["side"]].append(r)
    print("counts:", {ev: dict(Counter(r["side"] for s in sides.values() for r in s)) for ev, sides in by.items()})
    for ev, sides in by.items():
        mods, cmds = sides.get("mod", []), sides.get("cmd", [])
        for i in range(max(len(mods), len(cmds))):
            m = mods[i] if i < len(mods) else None
            c = cmds[i] if i < len(cmds) else None
            print(f"-- {ev}[{i}]")
            for k, p in PATHS.items():
                mv = _dig(m["e"], p) if m else "<no rec>"
                cv = _dig(c["e"], p) if c else "<no rec>"
                if mv == "<absent>" and cv == "<absent>":
                    continue
                print(f"   {k:16} {'==' if mv == cv else '!='} mod={mv!r} cmd={cv!r}")
            if m:
                print(f"   mod.context={m.get('context')} mod.version={(m.get('version') or {}).get('version')} mod.sessionId={m.get('sessionId')}")
            if c and ("ctx_tokens_py" in c or "ctx_error" in c):
                print(f"   cmd.ctx_tokens_py={c.get('ctx_tokens_py')} cmd.version_py={c.get('version_py')} host={c.get('host')} {c.get('ctx_error', '')}")
    for r in recs:
        if r["ev"] == "session.start":
            print("session.start:", json.dumps({k: r.get(k) for k in ("isInteractive", "hostname", "gitEmail", "env")}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
