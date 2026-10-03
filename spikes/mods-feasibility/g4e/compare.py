"""logs/<tag>/ の独自イベント（mod）と command hook（cmd）を対応づけて、回数と列の値を突き合わせる。usage: compare.py <log_dir>"""

import json
import os
import sys
from collections import Counter

# Esc で切られたツールの結果の印。command hook はこの呼び出しで発火しない
_INTERRUPTED = "[Request interrupted by user"

# command hook のイベント → それに当たる独自イベントの記録を選ぶ関数
_MAP = {
    "UserPromptSubmit": lambda r: r["ev"] == "prompt.submit",
    "UserPromptExpansion": lambda r: r["ev"] == "command.run" and (r.get("info") or {}).get("source") in ("plugin", "user", "mcp"),
    "PostToolUse": lambda r: r["ev"] == "tool.call" and not r.get("isError") and not r.get("deny"),
    "PostToolUseFailure": lambda r: r["ev"] == "tool.call" and r.get("isError") and _INTERRUPTED not in (r.get("errHead") or ""),
    "PreCompact": lambda r: r["ev"] == "session.compact",
    "Stop": lambda r: r["ev"] == "turn.complete" and not r.get("agentId") and r.get("reason") != "aborted",
    "SessionEnd": lambda r: r["ev"] == "session.end",
    "SessionStart": lambda r: r["ev"] == "session.start",
}


def _load(d: str) -> list[dict]:
    recs = []
    for name in sorted(os.listdir(d)):
        with open(os.path.join(d, name), encoding="utf-8") as f:
            r = json.loads(f.read())
        if r["side"] == "cmd":
            r["e"] = json.loads(r.pop("raw"))
        recs.append(r)
    return sorted(recs, key=lambda r: (r["at"], r.get("seq", 0)))


def _pairs(cmd: dict, mod: dict) -> list[tuple[str, object, object]]:
    e = cmd["e"]
    out = [("session_id", e.get("session_id"), mod.get("sessionId") or mod.get("endingSessionId"))]
    if "tool_name" in e:
        out.append(("tool_name", e["tool_name"], mod.get("tool")))
        out.append(("agent_id", e.get("agent_id"), mod.get("agentId")))
        sk = (e.get("tool_input") or {}).get("skill")
        if sk or mod.get("skill"):
            out.append(("skill_name", sk, mod.get("skill")))
    if "is_interrupt" in e:
        out.append(("is_interrupt", e["is_interrupt"], "<n/a>"))
    if cmd["ev"] == "Stop":
        out.append(("prompt_id", e.get("prompt_id"), mod.get("promptIdTx")))
        out.append(("prompt_id/tail", e.get("prompt_id"), (mod.get("tail") or {}).get("promptId")))
        out.append(("permission_mode", e.get("permission_mode"), mod.get("permissionModeTx")))
        out.append(("perm_mode/tail", e.get("permission_mode"), (mod.get("tail") or {}).get("permissionMode")))
        out.append(("context_tokens", cmd.get("ctx_tokens_py"), (mod.get("context") or {}).get("tokens")))
    if cmd["ev"] == "PreCompact":
        out.append(("compact_trigger", e.get("trigger"), mod.get("trigger")))
        out.append(("context_tokens", cmd.get("ctx_tokens_py"), (mod.get("context") or {}).get("tokens")))
    if cmd["ev"] == "UserPromptExpansion":
        out.append(("command_name", e.get("command_name"), mod.get("command")))
        out.append(("command_source", e.get("command_source"), (mod.get("info") or {}).get("source")))
    return out


def main(d: str) -> None:
    recs = _load(d)
    cmds = [r for r in recs if r["side"] == "cmd"]
    mods = [r for r in recs if r["side"] == "mod"]
    print("mod events:", dict(Counter(r["ev"] for r in mods)))
    for ev, pick in _MAP.items():
        cs = [r for r in cmds if r["ev"] == ev]
        ms = [r for r in mods if pick(r)]
        print(f"== {ev}: cmd={len(cs)} mod={len(ms)}")
        for i in range(min(len(cs), len(ms))):
            for k, cv, mv in _pairs(cs[i], ms[i]):
                print(f"   [{i}] {k:15} {'==' if cv == mv else '!='} cmd={cv!r} mod={mv!r}")
    for r in cmds:
        e = r["e"]
        extra = {k: e[k] for k in ("source", "permission_mode", "effort", "agent_id", "trigger", "reason") if k in e}
        print("cmd", r["ev"], json.dumps(extra))
    for r in mods:
        if r["ev"] in ("session.start", "session.end", "command.run", "session.compact", "classic.SessionStart", "skill.prompt", "turn.complete"):
            keep = {k: r.get(k) for k in ("turns", "messages", "reason", "trigger", "command", "origin", "info", "source", "skill", "isAborted", "agentId", "turnId") if k in r}
            print("mod", r["ev"], json.dumps(keep, ensure_ascii=False))
        if r["ev"] == "turn.step":
            print("mod turn.step", r.get("index"), r.get("agentId"), r.get("effort"), [c["value"] for c in r.get("config", []) if c.get("key") == "permissionMode"])


if __name__ == "__main__":
    main(sys.argv[1])
