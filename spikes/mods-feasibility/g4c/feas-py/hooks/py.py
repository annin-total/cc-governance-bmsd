"""比較用の command hook。FEAS_PYWRITE=1 のとき SessionStart で settings.json の env.FEAS_MARK を書き換える。"""

import json
import os
import sys
import time

SAFE = "/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4c/"


def _record(ev: str, rec: dict) -> None:
    out = os.environ.get("FEAS_OUT", "")
    if not out.startswith(SAFE):
        return
    os.makedirs(out, exist_ok=True)
    with open(f"{out}/py-{time.time_ns()}-{ev}.json", "w", encoding="utf-8") as f:
        json.dump({"side": "py", "ev": ev, "at": time.time(), **rec}, f, ensure_ascii=False)


def main() -> None:
    ev = sys.argv[1]
    stdin = json.load(sys.stdin)
    cfg = os.environ.get("CLAUDE_CONFIG_DIR", "")
    rec = {"FEAS_MARK": os.environ.get("FEAS_MARK"), "source": stdin.get("source"), "file_path": stdin.get("file_path")}
    if ev == "SessionStart" and os.environ.get("FEAS_PYWRITE") == "1" and (cfg + "/").startswith(SAFE):
        path = os.path.join(cfg, "settings.json")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        mark = f"py-{time.time_ns()}"
        data.setdefault("env", {})["FEAS_MARK"] = mark
        tmp = path + ".pytmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        os.replace(tmp, path)
        rec["wrote"] = mark
    _record(ev, rec)


main()
