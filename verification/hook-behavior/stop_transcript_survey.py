#!/usr/bin/env python3
"""`plugin/hooks/_context.py` の context_tokens() と同じ処理で、Stop 時点の値と周辺情報を記録する。"""

import json
import os
import sys
import time


def context_tokens(path, tail=256 * 1024):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - tail))
            chunk = f.read()
    except OSError:
        return None
    for line in reversed(chunk.split(b"\n")):
        try:
            u = json.loads(line).get("message", {}).get("usage")
        except Exception:
            continue
        if u:
            return (
                u.get("input_tokens", 0)
                + u.get("cache_creation_input_tokens", 0)
                + u.get("cache_read_input_tokens", 0)
            )
    return None


def survey(path):
    """transcript の行数・最終 assistant 行の uuid・末尾 usage を返す。"""
    n = 0
    last_uuid = None
    last_usage = None
    last_type = None
    try:
        with open(path, "rb") as f:
            for line in f:
                n += 1
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                last_type = d.get("type")
                u = d.get("message", {}).get("usage")
                if u:
                    last_uuid, last_usage = d.get("uuid"), u
    except OSError:
        pass
    return {
        "lines": n,
        "last_usage_uuid": last_uuid,
        "last_usage": last_usage,
        "last_line_type": last_type,
    }


if __name__ == "__main__":
    data = json.loads(sys.stdin.read() or "{}")
    p = data.get("transcript_path", "")
    out = {
        "at": "stop_hook",
        "ts": time.time(),
        "hook": data.get("hook_event_name"),
        "session_id": data.get("session_id"),
        "transcript_path": p,
        "size": os.path.getsize(p) if p and os.path.exists(p) else None,
        "context_tokens": context_tokens(p),
        "survey": survey(p),
    }
    d = os.environ.get("CAPTURE_DIR", ".")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f"stop-{int(time.time() * 1000)}.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    sys.exit(0)
