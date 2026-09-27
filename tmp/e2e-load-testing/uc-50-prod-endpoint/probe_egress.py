"""UC50: 本番らしい ingest_url で、publish の検査がゲートするか・検査が無ければ送信がどこへ向かうかを見る。

使い方（wt-b のルートで）: CC_E2E_RUN=b .venv/bin/python -B tmp/e2e-load-testing/uc-50-prod-endpoint/probe_egress.py
認証は使わない（未ログインのセッションでも SessionStart は発火する）。Docker も使わない。
"""

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

E2E = Path(__file__).resolve().parents[3] / "e2e"
sys.path.insert(0, str(E2E))

import _market  # noqa: E402
from _flow import data_dir, install, install_path, session  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402

_AUDIT = (
    "import runpy,sys\n"
    "def h(e,a):\n"
    "    if e in ('socket.getaddrinfo','socket.connect'): print('AUDIT',e,a[:2],flush=True)\n"
    "sys.addaudithook(h)\n"
    "sys.path.insert(0,sys.argv[1]); runpy.run_path(sys.argv[1]+'/_sender.py',run_name='__main__')\n"
)


class _Recorder(BaseHTTPRequestHandler):
    seen: list = []

    def do_CONNECT(self) -> None:
        self.seen.append(("CONNECT", self.path))
        self.send_error(502)

    def do_GET(self) -> None:
        self.seen.append(("GET", self.path))
        self.send_error(502)

    do_POST = do_GET

    def log_message(self, *_a) -> None:
        pass


def _summary(root: E2ERoot) -> dict:
    data = data_dir(root)
    rows = hook_rows(data)
    return {
        "installed_ingest_url": json.loads((install_path(root) / "config.json").read_text())["ingest_url"],
        "spool_files": len(list((data / "spool").glob("*.jsonl"))),
        "rows": len(rows),
        "errors": sorted({(r["stage"], r["error_type"]) for r in rows if r.get("kind") == "error"}),
        "sent_at": (data / "sent_at").exists(),
    }


def gate() -> str:
    """検査ありの publish が止まるか。"""
    root = E2ERoot()
    try:
        _market.publish(root, _market.version(1))
        return "publish が通った（検査がゲートしていない）"
    except RuntimeError as e:
        return f"publish が止まった: {e}"
    finally:
        root.cleanup()


def bypass(proxy: bool) -> dict:
    """検査を外して導入し、未ログインで 1 セッション。proxy なら記録用プロキシ越し。"""
    original = _market._check_ingest_url
    _market._check_ingest_url = lambda _p: None
    srv = None
    if proxy:
        _Recorder.seen = []
        srv = ThreadingHTTPServer(("127.0.0.1", 0), _Recorder)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        os.environ["HTTPS_PROXY"] = os.environ["https_proxy"] = f"http://127.0.0.1:{srv.server_address[1]}"
    root = E2ERoot()
    git = GitHttpServer(root.srv)
    try:
        install(root, git, _market.version(1))
        session(root)
        root.wait_quiet()
        out = _summary(root)
        if proxy:
            out["proxy_seen"] = sorted(set(_Recorder.seen))
        else:
            # 導入先の送信プロセスを監査フック付きで直接動かし、名前解決と接続の宛先を見る
            hooks = str(install_path(root) / "hooks")
            env = root.env()
            env["CLAUDE_PLUGIN_DATA"] = str(data_dir(root))
            res = subprocess.run(
                ["python3", "-B", "-c", _AUDIT, hooks], env=env, capture_output=True,
                text=True, timeout=120,
            )  # fmt: skip
            out["audit"] = [line for line in res.stdout.splitlines() if line.startswith("AUDIT")]
            out["after_direct_send"] = _summary(root)
        return out
    finally:
        _market._check_ingest_url = original
        for k in ("HTTPS_PROXY", "https_proxy"):
            os.environ.pop(k, None)
        git.close()
        root.cleanup()
        if srv:
            srv.shutdown()
            srv.server_close()


if __name__ == "__main__":
    print("config.json:", json.loads((_market.PLUGIN_SRC / "config.json").read_text())["ingest_url"])
    print("gate:", gate())
    print("bypass+proxy:", json.dumps(bypass(proxy=True), ensure_ascii=False))
    print("bypass+direct:", json.dumps(bypass(proxy=False), ensure_ascii=False))
