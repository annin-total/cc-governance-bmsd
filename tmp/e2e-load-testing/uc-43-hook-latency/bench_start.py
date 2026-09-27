"""計測 1（未ログインの起動）と計測 3（SessionStart の初回・2 回目、送信先が閉じている／遅い場合）。

`python3 bench_start.py [回数]`。claude は常に 1 つずつ直列。結果は LOCAL/start.json。
"""

import json
import os
import subprocess
import shutil
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from _uc43 import Installed, dump, inject_sleep, summary, timed  # isort: skip (e2e/ を path に足す)
from _market import PLUGIN_SRC
from _root import E2ERoot, hook_rows

N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
N_GATE = min(5, N)
N_S3 = min(10, N)
_SLOW_SEC = 10


def _config(url: str, timeout_sec: int) -> dict:
    cfg = json.loads((PLUGIN_SRC / "config.json").read_text(encoding="utf-8"))
    cfg.update(ingest_url=url, ingest_token="x", timeout_sec=timeout_sec)
    return {"config.json": json.dumps(cfg).encode()}


def _closed_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class SlowServer:
    """POST を受けて _SLOW_SEC 秒待ってから 200 を返す。受けた時刻を控える。"""

    def __init__(self) -> None:
        self.hits: list = []
        hits = self.hits

        class H(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                hits.append(time.time())
                self.rfile.read(int(self.headers.get("Content-Length") or 0))
                time.sleep(_SLOW_SEC)
                self.send_response(200)
                self.end_headers()

            def log_message(self, *a) -> None:
                pass

        self._srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.port = self._srv.server_address[1]
        threading.Thread(target=self._srv.serve_forever, daemon=True).start()

    def close(self) -> None:
        self._srv.shutdown()
        self._srv.server_close()


def _data(root: E2ERoot):
    d = root.config / "plugins" / "data"
    dirs = list(d.iterdir()) if d.is_dir() else []
    return dirs[0] if len(dirs) == 1 else None


def _start(root: E2ERoot, pre=None, path_prefix: str = ""):
    def fn():
        if pre:
            pre()
        saved = os.environ["PATH"]
        if path_prefix:
            os.environ["PATH"] = f"{path_prefix}:{saved}"
        d = _data(root)
        n0 = len(hook_rows(d)) if d else 0
        t0 = time.perf_counter()
        res = root.run_claude("-p", "ok", timeout=90)
        dt = time.perf_counter() - t0
        os.environ["PATH"] = saved
        d = _data(root)
        added = hook_rows(d)[n0:] if d else []
        kinds = sorted({f"{r.get('kind')}:{r.get('hook_event') or r.get('key_name')}" for r in added})
        return {"rc": res.returncode, "claude_sec": round(dt, 4), "rows_added": len(added),
                "kinds": kinds}  # fmt: skip

    return timed(fn)


def main() -> None:
    a = Installed(1)
    snap = (a.root.config / "settings.json").read_bytes()  # 導入直後・SessionStart 前
    b = E2ERoot()
    ss = (PLUGIN_SRC / "hooks" / "session_start.py").read_text(encoding="utf-8")
    g = Installed(2, {"hooks/session_start.py": inject_sleep(ss).encode()})
    closed = Installed(3, _config(f"http://127.0.0.1:{_closed_port()}/ingest", 60))
    slow_srv = SlowServer()
    slow = Installed(4, _config(f"http://127.0.0.1:{slow_srv.port}/ingest", 30))

    def reset_first() -> None:
        (a.root.config / "settings.json").write_bytes(snap)
        shutil.rmtree(a.root.config / "governance", ignore_errors=True)
        d = _data(a.root)
        if d:
            shutil.rmtree(d)
            d.mkdir()

    def unsent(inst: Installed):
        def pre() -> None:
            d = _data(inst.root)
            if d:
                (d / "sent_at").unlink(missing_ok=True)

        return pre

    realbin = a.root.tmp / "realbin"
    realbin.mkdir()
    real_py = subprocess.check_output(["pyenv", "which", "python3"], text=True).strip()
    (realbin / "python3").symlink_to(real_py)
    runs: dict = {k: [] for k in ("plugin", "none", "plugin_realpy", "gate_sleep0.5", "first", "second",
                                  "send_closed", "send_slow")}  # fmt: skip
    for i in range(N):
        order = [("plugin", a.root, ""), ("none", b, ""), ("plugin_realpy", a.root, str(realbin))]
        if i % 2:
            order.reverse()
        if i < N_GATE:
            order.append(("gate_sleep0.5", g.root, ""))
        for name, root, prefix in order:
            runs[name].append(_start(root, path_prefix=prefix))
    for i in range(N_S3):
        runs["first"].append(_start(a.root, reset_first))
        runs["second"].append(_start(a.root))
        runs["send_closed"].append(_start(closed.root, unsent(closed)))
        runs["send_slow"].append(_start(slow.root, unsent(slow)))
    time.sleep(_SLOW_SEC + 2)
    result = {
        "summary": {k: summary([r["sec"] for r in v]) for k, v in runs.items() if v},
        "slow_hits": len(slow_srv.hits),
        "runs": runs,
    }
    dump("start.json", result)
    for k, v in result["summary"].items():
        extra = [r["extra"]["rows_added"] for r in runs[k]]
        print(f"{k:16s} {v} rows_added={extra} kinds={runs[k][-1]['extra']['kinds']}")
    print("rc", {k: sorted({r["extra"]["rc"] for r in v}) for k, v in runs.items() if v})
    print("slow_hits", result["slow_hits"])
    slow_srv.close()
    for inst in (a, g, closed, slow):
        inst.close()
    b.cleanup()


if __name__ == "__main__":
    main()
