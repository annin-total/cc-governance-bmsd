"""計測 2（hook 単体）と、その計測が hook を動かしていることのゲート（sleep 0.5 入りのコピー）。

`python3 bench_hooks.py [回数]`。結果は LOCAL/hooks.json。開発ツリーの plugin/ は書き換えない。
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

from _uc43 import FIXTURES, Installed, dump, inject_sleep, summary, timed

N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
COLLECT_EVENTS = (
    "UserPromptSubmit", "UserPromptExpansion", "PostToolUse", "PostToolUseFailure",
    "PreCompact", "Stop",
)  # fmt: skip
_BIG_TRANSCRIPT_MB = 20


def _fixtures() -> dict:
    """hook 名 → 実採取の stdin（バイト列）の一覧。ファイルは読むだけ。"""
    out: dict = {}
    for f in sorted(FIXTURES.glob("*.json")):
        data = f.read_bytes()
        out.setdefault(json.loads(data).get("hook_event_name"), []).append(data)
    return out


def _big_transcript_stdin(path: Path, stop_input: bytes) -> bytes:
    """大きな transcript を作り、Stop の stdin の transcript_path だけ差し替えた版（メモリ上）。"""
    line = json.dumps({"message": {"usage": {"input_tokens": 1, "cache_read_input_tokens": 9}}})
    with open(path, "w", encoding="utf-8") as f:
        for _ in range(_BIG_TRANSCRIPT_MB * 1024 * 1024 // (len(line) + 1)):
            f.write(line + "\n")
    obj = json.loads(stop_input)
    obj["transcript_path"] = str(path)
    return json.dumps(obj).encode()


def main() -> None:
    inst = Installed(1)
    root = inst.root
    real_py = subprocess.check_output(["pyenv", "which", "python3"], text=True).strip()
    slow = root.tmp / "slow"
    shutil.copytree(inst.install_path, slow, ignore=shutil.ignore_patterns("__pycache__"))
    for name in ("collect.py", "session_start.py"):
        p = slow / "hooks" / name
        p.write_text(inject_sleep(p.read_text(encoding="utf-8")), encoding="utf-8")
    data_dir = root.path / "hookdata"
    env = root.env()
    env.update(
        CLAUDE_CONFIG_DIR=str(root.path / "hookcfg"),
        CLAUDE_PLUGIN_DATA=str(data_dir),
        CLAUDE_CODE_ENTRYPOINT="sdk-cli",
    )
    fx = _fixtures()
    big = _big_transcript_stdin(root.tmp / "big.jsonl", fx["Stop"][0])

    def hook(py: str, plugin: Path, script: str, event: str, stdin: bytes):
        e = dict(env, CLAUDE_PLUGIN_ROOT=str(plugin))
        args = [py, str(plugin / "hooks" / script), event]
        return lambda: subprocess.run(args, input=stdin, env=e, capture_output=True, timeout=30)

    cases: dict = {
        "python3 -c pass": lambda i: lambda: subprocess.run(["python3", "-c", "pass"], env=env),
        "python3 -S -c pass": lambda i: lambda: subprocess.run(["python3", "-S", "-c", "pass"], env=env),
        "real -c pass": lambda i: lambda: subprocess.run([real_py, "-c", "pass"], env=env),
        "real -S -c pass": lambda i: lambda: subprocess.run([real_py, "-S", "-c", "pass"], env=env),
    }  # fmt: skip
    ip = inst.install_path
    for ev in COLLECT_EVENTS:
        cases[ev] = lambda i, ev=ev: hook("python3", ip, "collect.py", ev, fx[ev][i % len(fx[ev])])
    ss = fx["SessionStart"]
    cases["SessionStart"] = lambda i: hook("python3", ip, "session_start.py", "SessionStart", ss[i % len(ss)])
    cases["Stop(20MB transcript)"] = lambda i: hook("python3", ip, "collect.py", "Stop", big)
    pt = fx["PostToolUse"]
    cases["PostToolUse(real python)"] = lambda i: hook(real_py, ip, "collect.py", "PostToolUse", pt[i % len(pt)])
    cases["SessionStart(real python)"] = lambda i: hook(real_py, ip, "session_start.py", "SessionStart", ss[i % len(ss)])
    cases["GATE PostToolUse+sleep0.5"] = lambda i: hook("python3", slow, "collect.py", "PostToolUse", pt[i % len(pt)])
    cases["GATE SessionStart+sleep0.5"] = lambda i: hook("python3", slow, "session_start.py", "SessionStart", ss[i % len(ss)])  # fmt: skip

    runs: dict = {k: [] for k in cases}
    bad: list = []
    for i in range(N):
        for name, make in cases.items():
            fn = make(i)

            def call(fn=fn):
                res = fn()
                return {"rc": res.returncode, "stderr": len(res.stderr or b"")}

            r = timed(call)
            if r["extra"]["rc"] != 0 or r["extra"]["stderr"]:
                bad.append((name, i, r["extra"]))
            runs[name].append(r)
    queue = data_dir / "queue.jsonl"
    rows = len(queue.read_text().splitlines()) if queue.exists() else 0
    spool = sum(len(p.read_text().splitlines()) for p in (data_dir / "spool").glob("*.jsonl"))
    result = {
        "summary": {k: summary([r["sec"] for r in v]) for k, v in runs.items()},
        "first_run": {k: v[0]["sec"] for k, v in runs.items()},
        "bad": bad,
        "rows_written": {"queue": rows, "spool": spool},
        "load": [r["before"] for v in runs.values() for r in v],
        "runs": runs,
    }
    dump("hooks.json", result)
    for k, v in result["summary"].items():
        print(f"{k:32s} {v}")
    print("first_run", result["first_run"])
    print("bad", bad[:5], "rows", result["rows_written"])
    inst.close()


if __name__ == "__main__":
    main()
