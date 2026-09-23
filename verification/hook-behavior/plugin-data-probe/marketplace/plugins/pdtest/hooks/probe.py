#!/usr/bin/env python3
"""hook プロセスに渡る環境変数と、コマンド文字列で展開された値の両方を記録する。"""

import json
import os
import sys
import time

try:
    d = os.environ.get("PROBE_DIR", "/tmp")
    os.makedirs(d, exist_ok=True)
    out = {
        "env_claude": {k: v for k, v in os.environ.items() if "CLAUDE" in k.upper()},
        "env_CLAUDE_PLUGIN_DATA": os.environ.get("CLAUDE_PLUGIN_DATA"),
        "expanded_in_command": os.environ.get("PROBE_EXPANDED"),
        "stdin": sys.stdin.read(),
        "all_env_keys": sorted(os.environ.keys()),
    }
    with open(
        os.path.join(d, f"probe-{int(time.time() * 1000)}-{os.getpid()}.json"), "w"
    ) as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
except Exception as e:
    try:
        with open(
            os.path.join(os.environ.get("PROBE_DIR", "/tmp"), "probe-error.txt"), "a"
        ) as f:
            f.write(repr(e) + "\n")
    except Exception:
        pass
sys.exit(0)
