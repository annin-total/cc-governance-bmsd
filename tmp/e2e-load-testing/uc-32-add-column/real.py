"""UC32: 新プラグインを導入した実セッションの行を、ALTER 済みの既存 DB を持つ新サーバまで届ける。

送信は 10 分に 1 回までなので、セッション後に _sender.py を 1 回同期で動かして残りを送る。
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run
from _flow import ask, data_dir, ingest_config, install, install_path
from _githttp import GitHttpServer
from _market import version
from _root import hook_rows
from _server import docker


def main() -> None:
    root = run.E2ERoot()
    srv = git = None
    image = None
    try:
        image = run.build(root, run.WORK / "server", "new")
        # 既存 DB（旧サーバが作った表）に手順どおり ALTER したものを使う
        old = run.build(root, run.WORK / "server.old", "old")
        s0 = run.Server(root, old, "s0")
        s0.start_with()
        s0.wait_exit()
        d0 = s0.stop_and_take_db(root.tmp / "d0.db")
        s0.close()
        docker("image", "rm", old, check=False)
        d1 = run.alter(d0, root.tmp / "d1.db", f"ALTER TABLE events ADD COLUMN {run.COL} INTEGER")
        srv = run.Server(root, image, "real")
        srv.start_with(d1)
        run.log("real_server_start", srv.wait_exit()[:2])

        git = GitHttpServer(root.srv)
        install(root, git, version(1), ingest_config(srv.port, srv.token))
        t0 = time.monotonic()
        ask(root, "Run the Bash command `echo uc32-ok` once, then reply done.",
            model="haiku", tools=("Bash(echo:*)",))  # fmt: skip
        root.wait_quiet()
        run.log("real_session_sec", round(time.monotonic() - t0, 1))
        dd = data_dir(root)
        rows = hook_rows(dd)
        run.log("real_unsent_rows", [(r.get("hook_event"), r.get(run.COL)) for r in rows])
        env = root.env()
        env.update(CLAUDE_PLUGIN_DATA=str(dd), CLAUDE_PLUGIN_ROOT=str(install_path(root)))
        res = subprocess.run(["python3", str(install_path(root) / "hooks" / "_sender.py")], env=env,
                             capture_output=True, timeout=120, check=False)  # fmt: skip
        run.log("real_sender", [res.returncode, res.stderr[-300:].decode("utf-8", "replace")])
        root.wait_quiet()
        run.log("real_left_after_send", len(hook_rows(dd)))
        run.log("real_db", [r[1:] for r in srv.dump()["rows"]])
    finally:
        if git:
            git.close()
        if srv:
            srv.close()
        if image:
            docker("image", "rm", image, check=False)
        out = run.LOG / "result-real.json"
        out.write_text(json.dumps(run.RESULT, ensure_ascii=False, indent=1), "utf-8")
        root.cleanup()


if __name__ == "__main__":
    os.environ.setdefault("CC_E2E_RUN", "b-uc32")
    main()
