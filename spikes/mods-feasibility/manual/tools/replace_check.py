"""settings.json を os.replace で置き換えたとき、失敗（共有違反など）が起きるかを確かめる。

使い方: python replace_check.py [--seconds 20] [--keep] [--claude claude]
  一時ディレクトリに隔離した CLAUDE_CONFIG_DIR を作り、その中の settings.json だけを書き換える。
  A: 自分で開いたままのファイルへの置き換え。B: claude（隔離 config・未ログインでよい）が
  /feas-field hold で起きている間の連続した置き換え。本人の ~/.claude には触れない。モデルは呼ばない。
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN_DIR = HERE.parent / "feas-field"
INHERITED = [
    "CLAUDE_CODE_SSE_PORT",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_BRIDGE_SESSION_ID",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDECODE",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
    "CLAUDE_CONFIG_DIR",
]
STARTUP_SEC = 4
QUIET_SEC = 6
INTERVAL_SEC = 0.02
PAD_SIZES = (16, 200_000)
SETTINGS_LINE = re.compile(r"settings", re.IGNORECASE)
TROUBLE = re.compile(r"error|fail|invalid|EBUSY|EPERM|ENOENT|parse", re.IGNORECASE)


def _content(i: int) -> str:
    return json.dumps(
        {"env": {"FEAS_REPLACE": str(i), "FEAS_PAD": "x" * PAD_SIZES[i % 2]}}
    )


def _replace(dst: Path, i: int) -> str:
    tmp = dst.with_name(f".settings.{i}.tmp")
    tmp.write_text(_content(i), encoding="utf-8")
    try:
        os.replace(tmp, dst)
        return "ok"
    except OSError as e:
        tmp.unlink()
        return f"{type(e).__name__}(winerror={getattr(e, 'winerror', None)}, errno={e.errno})"


def _phase_a(dst: Path) -> dict[str, str]:
    with dst.open("r", encoding="utf-8"):
        held = _replace(dst, 1)
    return {"whileOpenByPython": held, "afterClose": _replace(dst, 2)}


def _phase_b(
    root: Path, cfg: Path, dst: Path, seconds: int, claude: str
) -> dict[str, object]:
    env = {k: v for k, v in os.environ.items() if k not in INHERITED}
    env.update(CLAUDE_CONFIG_DIR=str(cfg), PYTHONDONTWRITEBYTECODE="1")
    debug = root / "debug.log"
    cmd = [
        claude,
        "-p",
        f"/feas-field hold {seconds}",
        "--plugin-dir",
        str(PLUGIN_DIR),
        "--debug-file",
        str(debug),
    ]
    proc = subprocess.Popen(
        cmd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(STARTUP_SEC)
    results: collections.Counter = collections.Counter()
    i = 10
    # 連続した置き換えの間は本体の監視が変更を拾わないことがあるので、最後に 1 回だけ置き換えて静かに待つ
    burst_until = time.time() + max(1, seconds - STARTUP_SEC - QUIET_SEC)
    while proc.poll() is None and time.time() < burst_until:
        results[_replace(dst, i)] += 1
        i += 1
        time.sleep(INTERVAL_SEC)
    results["final:" + _replace(dst, i)] += 1
    out, _ = proc.communicate()
    lines = (
        debug.read_text(encoding="utf-8", errors="replace").splitlines()
        if debug.exists()
        else []
    )
    trouble = [ln for ln in lines if SETTINGS_LINE.search(ln) and TROUBLE.search(ln)]
    try:
        json.loads(dst.read_text(encoding="utf-8"))
        final = "valid json"
    except ValueError as e:
        final = f"broken: {type(e).__name__}"
    return {
        "claudeRc": proc.returncode,
        "claudeOut": out.decode("utf-8", "replace").strip()[:200],
        "replaces": dict(results),
        "debugDetectedChange": sum("Detected change" in ln for ln in lines),
        "debugSettingsTroubleLines": len(trouble),
        "debugSettingsTroubleHead": [
            re.sub(r"[A-Za-z]:\\[^\s]*|/[^\s]*", "<path>", ln)[:200]
            for ln in trouble[:5]
        ],
        "finalSettings": final,
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, default=20)
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--claude", default="claude")
    a = ap.parse_args()
    root = Path(tempfile.mkdtemp(prefix="feas-replace-"))
    cfg = root / "cfg"
    cfg.mkdir()
    dst = cfg / "settings.json"
    dst.write_text(_content(0), encoding="utf-8")
    claude = shutil.which(a.claude) or a.claude
    report = {
        "os": os.name,
        "python": sys.version.split()[0],
        "A": _phase_a(dst),
        "B": _phase_b(root, cfg, dst, a.seconds, claude),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if a.keep:
        print("work dir:", root)
    else:
        shutil.rmtree(root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
