"""計測 3 の内訳: session_start.py の段ごとの時間（初回・2 回目）をプロセス内で測る。

`python3 stage_profile.py [回数]`。installPath の hooks を import して段の関数を直接呼ぶ。結果は LOCAL/stages.json。
"""

import json
import shutil
import subprocess
import sys

from _uc43 import Installed, dump, summary  # isort: skip (e2e/ を path に足す)

N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
# 子プロセス（本物の python3）で動かす計時。import も 1 段として測る
_CHILD = r"""
import json, sys, time
t = time.perf_counter
out = {}
t0 = t()
sys.path.insert(0, sys.argv[1])
import session_start as ss
import _govdir, _identity, _notices
out["import"] = t() - t0
def step(name, fn):
    t1 = t(); fn(); out[name] = t() - t1
step("identity(git)", lambda: _identity.get_user_email(refresh=True))
step("statusline", lambda: _govdir.sync_statusline(_govdir.governance_dir()))
step("apply_settings", ss._apply_settings_step)
step("notices", lambda: _notices.notices_step(False, _notices._NOTICES_PATH))
step("collect+send_if_due", lambda: ss._collect_step("SessionStart", False))
print(json.dumps(out))
"""


def main() -> None:
    inst = Installed(1)
    root = inst.root
    real_py = subprocess.check_output(["pyenv", "which", "python3"], text=True).strip()
    cfg, data = root.path / "stagecfg", root.path / "stagedata"
    settings0 = (root.config / "settings.json").read_bytes()
    env = root.env()
    env.update(
        CLAUDE_CONFIG_DIR=str(cfg), CLAUDE_PLUGIN_DATA=str(data),
        CLAUDE_PLUGIN_ROOT=str(inst.install_path), CLAUDE_CODE_ENTRYPOINT="sdk-cli",
    )  # fmt: skip
    hooks = str(inst.install_path / "hooks")
    runs: dict = {"first": [], "second": []}
    for _ in range(N):
        shutil.rmtree(cfg, ignore_errors=True)
        shutil.rmtree(data, ignore_errors=True)
        cfg.mkdir()
        (cfg / "settings.json").write_bytes(settings0)
        for kind in ("first", "second"):
            res = subprocess.run(
                [real_py, "-c", _CHILD, hooks], input=b"{}", env=env, capture_output=True,
                timeout=30, check=True,
            )  # fmt: skip
            runs[kind].append(json.loads(res.stdout))
    stages = runs["first"][0].keys()
    result = {
        k: {s: summary([r[s] for r in v]) for s in stages} for k, v in runs.items()
    }
    dump("stages.json", {"summary": result, "runs": runs})
    for k, v in result.items():
        for s, m in v.items():
            print(f"{k:7s} {s:22s} median={m['median'] * 1000:.1f}ms p90={m['p90'] * 1000:.1f}ms")
    inst.close()


if __name__ == "__main__":
    main()
