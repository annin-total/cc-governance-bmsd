"""計測 1 の認証あり（haiku の往復）と計測 4（Bash 5 回のセッション）。

`python3 bench_auth.py <reply|bash> <回数>`。費用が BUDGET を超えたら止める。結果は LOCAL/auth-<種類>.json。
"""

import json
import os
import subprocess
import sys

from _uc43 import Installed, dump, summary, timed  # isort: skip (e2e/ を path に足す)
from _root import E2ERoot, hook_rows

KIND = sys.argv[1]
N = int(sys.argv[2])
BUDGET = float(os.environ.get("UC43_BUDGET", "0.2"))
PROMPTS = {
    "reply": ("Reply ok", ()),
    "bash": (
        "Run exactly these 5 shell commands, each in its own separate Bash tool call, "
        "one after another: echo 1, echo 2, echo 3, echo 4, echo 5. Then reply done.",
        ("--allowedTools", "Bash"),
    ),
}


def _ask(root: E2ERoot, prefix: str):
    prompt, tools = PROMPTS[KIND]

    def fn():
        saved = os.environ["PATH"]
        if prefix:
            os.environ["PATH"] = f"{prefix}:{saved}"
        try:
            res = root.run_claude(
                "-p", prompt, "--model", "haiku", *tools, "--output-format", "json",
                timeout=300, auth=True,
            )  # fmt: skip
        finally:
            os.environ["PATH"] = saved
        try:
            out = json.loads(res.stdout)
        except ValueError:
            return {"rc": res.returncode, "err": res.stderr[-300:]}
        return {
            "rc": res.returncode, "cost": out.get("total_cost_usd"), "turns": out.get("num_turns"),
            "duration_ms": out.get("duration_ms"), "api_ms": out.get("duration_api_ms"),
            "is_error": out.get("is_error"),
        }  # fmt: skip

    return timed(fn)


def main() -> None:
    a = Installed(1)
    b = E2ERoot()
    realbin = a.root.tmp / "realbin"
    realbin.mkdir()
    real_py = subprocess.check_output(["pyenv", "which", "python3"], text=True).strip()
    (realbin / "python3").symlink_to(real_py)
    runs: dict = {"plugin": [], "none": [], "plugin_realpy": []}
    spent = 0.0
    for i in range(N):
        start_spent = spent
        order = [("plugin", a.root, ""), ("none", b, ""), ("plugin_realpy", a.root, str(realbin))]
        if i % 2:
            order.reverse()
        for name, root, prefix in order:
            r = _ask(root, prefix)
            spent += r["extra"].get("cost") or 0
            runs[name].append(r)
            print(name, r["sec"], r["extra"], f"spent={spent:.4f}", r["before"], flush=True)
        if spent + (spent - start_spent) > BUDGET:
            print("次の 1 周で予算を超えるので止める")
            break
    d = list((a.root.config / "plugins" / "data").iterdir())[0]
    events = [r.get("hook_event") for r in hook_rows(d) if r.get("kind") == "event"]
    result = {
        "summary": {k: summary([r["sec"] for r in v]) for k, v in runs.items() if v},
        "api_ms": {k: summary([r["extra"]["api_ms"] / 1000 for r in v if r["extra"].get("api_ms")])
                   for k, v in runs.items() if v},  # fmt: skip
        "spent_usd": round(spent, 4),
        "plugin_events": {e: events.count(e) for e in set(events)},
        "runs": runs,
    }
    dump(f"auth-{KIND}.json", result)
    for k in result["summary"]:
        print(k, result["summary"][k], "api", result["api_ms"][k])
    print("spent", result["spent_usd"], "events", result["plugin_events"])
    a.close()
    b.cleanup()


if __name__ == "__main__":
    main()
