"""サーバ側の補助: 契約外のキー・壊れた行・受信時の例外に仕込んだ SENTINEL が、DB と docker logs に残らないか。

合成の POST（端末は通さない）。標準出力には SENTINEL の値を出さない。
"""

import json
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import runner  # noqa: E402,F401  (e2e/ を sys.path に足す)
import scan  # noqa: E402
from _root import E2ERoot  # noqa: E402
from _server import BASE_PATH, DockerServer, build_context  # noqa: E402


def _row(event_id: str, **extra) -> bytes:
    ts = int(time.time())
    return json.dumps({"kind": "event", "event_id": event_id, "ts": ts, "hook_event": "Stop", **extra}).encode()


def main() -> None:
    s = runner.new_sentinels(["badjson", "unknown", "dup", "token", "url"])
    table = {k: scan.forms(v) for k, v in s.items()}
    root = E2ERoot()
    srv = DockerServer(root, "uc38p")
    try:
        srv.start(build_context(root, "uc38p"))
        srv.wait_ready()
        hdr = {"Content-Type": "application/x-ndjson", "X-Ingest-Token": srv.token}
        path = f"{BASE_PATH}/ingest"
        dup_id = str(uuid.uuid4())
        cases = [
            ("badjson", path, b'{"kind":"event","prompt":"' + s["badjson"].encode() + b'"', hdr),
            ("unknown", path, _row(str(uuid.uuid4()), prompt=s["unknown"], tool_input={"command": s["unknown"]}), hdr),
            ("dup-1", path, _row(dup_id, prompt=s["dup"]), hdr),
            ("dup-2", path, _row(dup_id, prompt=s["dup"]), hdr),
            ("token", path, _row(str(uuid.uuid4()), prompt=s["token"]), {**hdr, "X-Ingest-Token": s["token"]}),
            ("url", f"{path}/{s['url']}", _row(str(uuid.uuid4())), hdr),
        ]
        resp_hits = []
        for name, p, body, h in cases:
            status, text, _ = srv.request("POST", p, body, h)
            m = scan.match(text.encode(), table)
            resp_hits += m
            print(f"{name}: status={status} body_len={len(text)} resp_hits={m}")
        db = srv.copy_data(root.tmp / "server")
        logs = srv.logs()
        print("db hits:", [(str(p.name), m) for p, m in scan.scan_tree(db, table)])
        print("log hits:", scan.match(logs.encode(), table))
        print("log has traceback:", "Traceback" in logs, "log bytes:", len(logs))
        tail = scan.redact(logs[-1500:], table)
        print("log tail (redacted):\n" + tail)
    finally:
        srv.close()
        root.cleanup()


if __name__ == "__main__":
    main()
