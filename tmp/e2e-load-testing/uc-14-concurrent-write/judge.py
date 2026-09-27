"""UC 14 の判定: 段の後の settings.json・バックアップ・残骸・policy 行・hook の結果を数える。"""

import hashlib
import json
from collections import Counter
from pathlib import Path

from uc14_lib import AUTO_UPDATE, AUTOCOMPACT, DENY, FAKE_STAMP, ONCE_KEY, USER, dig, install_path

N_KEYS = 4  # SET 2・ADD 1・ONCE 1


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()[:12]


def settings_checks(root, base: bytes) -> dict:
    """settings.json が有効な JSON で、利用者の値と配布値が両方あるか。"""
    try:
        data = json.loads((root.config / "settings.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return {"valid_json": False, "error": repr(e)}
    if not isinstance(data, dict):
        return {"valid_json": False, "error": "not an object"}
    b = json.loads(base)
    deny = dig(data, "permissions.deny")
    deny = deny if isinstance(deny, list) else []
    user_ok = {
        "theme": data.get("theme") == USER["theme"],
        "env.USER_KEEP": dig(data, "env.USER_KEEP") == "keep-me",
        "permissions.allow": dig(data, "permissions.allow") == USER["permissions"]["allow"],
        "deny.user": "Bash(rm -rf /)" in deny,
        "uc14_user": data.get("uc14_user") == USER["uc14_user"],
        "enabledPlugins": data.get("enabledPlugins") == b.get("enabledPlugins"),
    }
    dist_ok = {
        AUTOCOMPACT: dig(data, AUTOCOMPACT) == "60",
        AUTO_UPDATE: dig(data, AUTO_UPDATE) is True,
        "deny.dist_once": deny.count(DENY) == 1,
        ONCE_KEY: dig(data, ONCE_KEY) == "first",
    }
    return {"valid_json": isinstance(data, dict), "user": user_ok, "dist": dist_ok,
            "all_ok": all(user_ok.values()) and all(dist_ok.values())}  # fmt: skip


def backup_checks(root, base: bytes) -> dict:
    bdir = root.config / "governance" / "backups"
    files = sorted(bdir.glob("*"))
    kinds = Counter()
    for f in files:
        if FAKE_STAMP in f.name:
            kinds["fake"] += 1
            continue
        c = f.read_bytes()
        try:
            json.loads(c)
            kinds["base" if c == base else f"other:{_sha(c)}"] += 1
        except ValueError:
            kinds["broken"] += 1
    return {"count": len(files), "kinds": dict(kinds), "has_base": kinds["base"] > 0,
            "names": [f.name for f in files]}  # fmt: skip


def leftover_checks(root) -> dict:
    gov = root.config / "governance"
    src = install_path(root) / "statusline" / "statusline.js"
    dst = gov / "statusline.js"
    return {
        "settings_tmp": [p.name for p in root.config.glob(".settings-*")],
        "statusline_tmp": [p.name for p in gov.glob(".statusline*")],
        "statusline_ok": dst.is_file() and dst.read_bytes() == src.read_bytes(),
        "once_json": _read(gov / "once.json"),
        "config_files": sorted(p.name for p in root.config.iterdir()),
    }


def _read(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return f"<{type(e).__name__}>"


def row_checks(rows: list, completed: int) -> dict:
    pol = [r for r in rows if r.get("kind") == "policy"]
    ids = Counter(r.get("event_id") for r in rows)
    return {
        "policy_rows": len(pol),
        "expected": N_KEYS * completed,
        "by_result": dict(Counter(r["apply_result"] for r in pol)),
        "applied_by_key": dict(Counter(r["key_name"] for r in pol if r["apply_result"] == "applied")),
        "dup_event_ids": sum(c - 1 for c in ids.values() if c > 1),
        "errors": dict(Counter(f"{r.get('stage')}:{r.get('error_type')}" for r in rows if r.get("kind") == "error")),
        "events": dict(Counter(r.get("hook_event") for r in rows if r.get("kind") == "event")),
    }


def hook_checks(results: list) -> dict:
    hooks = [h for r in results for h in (r.get("hooks") or [])]
    return {
        "n": len(results),
        "launch_errors": [r["error"] for r in results if "error" in r][:3],
        "sessions_without_hook": sum(1 for r in results if not r.get("hooks")),
        "outcome": dict(Counter(h.get("outcome") for h in hooks)),
        "exit_code": dict(Counter(h.get("exit_code") for h in hooks)),
        "stderr_nonempty": sum(1 for h in hooks if h.get("stderr")),
        "stderr_samples": list({h["stderr"] for h in hooks if h.get("stderr")})[:3],
        "rc": dict(Counter(r.get("rc") for r in results)),
        "sec_max": max((r.get("sec", 0) for r in results), default=0),
        "sec_min": min((r.get("sec", 0) for r in results), default=0),
    }


def completed(results: list) -> int:
    return sum(1 for r in results for h in (r.get("hooks") or []) if h.get("outcome") in ("success", "direct"))
