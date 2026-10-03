"""切り離して起動する最小の送信プロセス。本体の終了を待ってから spool を POST し、2xx なら消す。"""
import json
import os
import sys
import time
import urllib.request

URL, OUT = sys.argv[1], sys.argv[2]
WAIT_SEC = 3


def _log(**kw: object) -> None:
    with open(f"{OUT}/sender.log", "a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.time(), "pid": os.getpid(), "ppid": os.getppid(), **kw}) + "\n")


_log(event="start", pgid=os.getpgid(0), sid=os.getsid(0))
time.sleep(WAIT_SEC)
spool = f"{OUT}/spool"
for name in sorted(os.listdir(spool)) if os.path.isdir(spool) else []:
    path = f"{spool}/{name}"
    with open(path, "rb") as f:
        body = f.read()
    req = urllib.request.Request(URL, data=body, method="POST", headers={
        "Content-Type": "application/x-ndjson", "X-Ingest-Token": "tok-sender"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            status = r.status
    except Exception as e:  # noqa: BLE001
        _log(event="error", file=name, err=type(e).__name__)
        break
    if 200 <= status < 300:
        os.remove(path)
    _log(event="posted", file=name, status=status, ppid_now=os.getppid())
_log(event="done")
