"""command hook の stdin をそのまま FEAS_LOG_DIR に 1 ファイルで書く。常に exit 0。"""

import json
import os
import platform
import sys
import time
import uuid

sys.dont_write_bytecode = True

# worktree の plugin/hooks（読むだけ）。feas-cmp/hooks から 5 階層上が worktree のルート
_HOOKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), *[".."] * 5, "plugin", "hooks")


def main() -> None:
    log_dir = os.environ.get("FEAS_LOG_DIR")
    if not log_dir:
        return
    ev = sys.argv[1] if len(sys.argv) > 1 else "unknown"
    raw = sys.stdin.read()
    rec = {"side": "cmd", "ev": ev, "at": int(time.time() * 1000), "host": platform.node(), "raw": raw}
    try:
        obj = json.loads(raw)
        sys.path.insert(0, _HOOKS)
        import _context

        tp = obj.get("transcript_path")
        rec["ctx_tokens_py"] = _context.context_tokens(tp)
        rec["version_py"] = _context.claude_code_version(tp)
    except Exception as e:  # noqa: BLE001
        rec["ctx_error"] = type(e).__name__
    name = f"cmd-{rec['at']}-{uuid.uuid4().hex[:8]}-{ev}.json"
    with open(os.path.join(log_dir, name), "w", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")


try:
    main()
except BaseException:  # noqa: BLE001, S110
    pass
