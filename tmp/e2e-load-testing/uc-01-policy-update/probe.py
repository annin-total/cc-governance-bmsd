"""型違いの値（cleanupPeriodDays を文字列に）で Claude Code が settings.json をどう扱うかを見る。"""

import json
import sys

import run
from run import V1, Ctx, _put, install, policy_src


def main() -> None:
    c = Ctx("probe")
    try:
        install(c.root, c.git, V1, policy_src({run.AC: "60", run.AUTO: True}, {}))
        c.session("s1 素の導入")
        c.edit(lambda d: _put(d, sys.argv[2] if len(sys.argv) > 2 else "cleanupPeriodDays", json.loads(sys.argv[1]) if len(sys.argv) > 1 else "30"))
        res = c.root.run_claude("-p", "ok", "--output-format", "stream-json", "--verbose", timeout=90)
        print("rc", res.returncode, "stderr", res.stderr[-800:])
        for line in res.stdout.splitlines():
            m = json.loads(line)
            if m.get("type") == "system":
                print(m.get("subtype"), {k: m.get(k) for k in ("plugins", "hook_name", "hook_event")})
        print(c.root.run_claude("plugin", "list", "--json", timeout=60).stdout[-600:])
        c.session("s2 型違いの後")
    finally:
        c.close()
        run.main.__globals__["shutil"].rmtree(run.BASE, ignore_errors=True)


if __name__ == "__main__":
    main()
