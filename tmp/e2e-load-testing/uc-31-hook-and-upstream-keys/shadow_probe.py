"""plugin/hooks/ に標準ライブラリと同名の空モジュールを置き、hook の終了コード・stderr・queue 行数・validate_plugin の結果を見る。

使い方: .venv/bin/python tmp/e2e-load-testing/uc-31-hook-and-upstream-keys/shadow_probe.py <出力先> [名前 ...]
置いたモジュールは必ず消す。API も Docker も使わない。
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
HOOKS = REPO / "plugin" / "hooks"
STDIN = json.dumps(
    {"session_id": "s1", "tool_name": "Bash", "permission_mode": "default", "source": "startup"}
)
CALLS = (("collect.py", "Stop"), ("collect.py", "PostToolUse"), ("session_start.py", "SessionStart"))


def _rows(data: Path) -> list:
    files = [data / "queue.jsonl", *sorted((data / "spool").glob("*.jsonl"))]
    return [json.loads(x) for f in files if f.is_file() for x in f.read_text().splitlines() if x]


def probe(label: str, out: Path) -> dict:
    d = Path(tempfile.mkdtemp(prefix=f"{label}-", dir=out))
    (d / "data").mkdir()
    (d / "cfg").mkdir()
    env = {
        "PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "PYTHONDONTWRITEBYTECODE": "1",
        "CLAUDE_PLUGIN_ROOT": str(REPO / "plugin"), "CLAUDE_PLUGIN_DATA": str(d / "data"),
        "CLAUDE_CONFIG_DIR": str(d / "cfg"), "CC_GOVERNANCE_USER_EMAIL": "e2e@example.invalid",
    }
    res = {"label": label, "calls": []}
    for script, ev in CALLS:
        p = subprocess.run(["python3", str(HOOKS / script), ev], input=STDIN, env=env,
                           capture_output=True, text=True, timeout=30)
        res["calls"].append({"hook": ev, "rc": p.returncode, "stderr_head": p.stderr[-300:],
                             "stdout_bytes": len(p.stdout)})
    rows = _rows(d / "data")
    res["rows"] = len(rows)
    res["error_rows"] = [(r.get("stage"), r.get("error_type")) for r in rows if r.get("kind") == "error"]
    v = subprocess.run([str(REPO / ".venv/bin/python"), str(REPO / "scripts/validate_plugin.py")],
                       capture_output=True, text=True, cwd=REPO, timeout=300)
    res["validate_rc"] = v.returncode
    res["validate_ng"] = [x for x in v.stdout.splitlines() if "NG" in x or "失敗" in x]
    return res


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    results = [probe("baseline", out)]
    for name in sys.argv[2:]:
        mod = HOOKS / f"{name}.py"
        assert not mod.exists(), mod
        mod.write_text("")
        try:
            results.append(probe(f"shadow_{name}", out))
        finally:
            mod.unlink()
    print(json.dumps(results, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
