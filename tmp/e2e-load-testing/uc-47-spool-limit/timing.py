"""UC47 の 5: spool の大きさと hook・送信プロセスの処理時間。Docker を使わない（送信先は閉じたポート）。"""

import json
import os
import shutil
import statistics
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import LOCAL, MB, Box, closed_port_url, tmp_base

PYS = {"shim": "python3", "pyenv313": os.path.expanduser("~/.pyenv/versions/3.13.2/bin/python3"),
       "apple39": "/usr/bin/python3"}  # fmt: skip
SPOOL_FILES = (0, 1000, 10000, 30000)
REPEAT = 10


def fill(box: Box, n: int) -> None:
    """約 150 バイトの小さなファイルを n 個（合計は上限の 5 MB 未満）。"""
    box.spool.mkdir(parents=True, exist_ok=True)
    now = int(time.time())
    for i in range(n):
        p = box.spool / f"{now - n + i}-{uuid.uuid4().hex}.jsonl"
        p.write_text(json.dumps({"kind": "event", "event_id": str(uuid.uuid4()), "ts": now, "session_id": "t"}) + "\n")


def stats(xs: list) -> dict:
    ms = sorted(round(x * 1000, 1) for x in xs)
    return {"median_ms": statistics.median(ms), "min_ms": ms[0], "max_ms": ms[-1], "n": len(ms)}


def measure(box: Box) -> dict:
    out = {}
    box.hook("PostToolUse", "warm")  # バイトコードを作らせる
    out["PostToolUse"] = stats([box.hook("PostToolUse", "t")[0] for _ in range(REPEAT)])
    (box.data / "sent_at").touch()
    out["Stop_not_due"] = stats([box.hook("Stop", "t")[0] for _ in range(REPEAT)])
    due = []
    for _ in range(5):
        box.age_sent_at()
        due.append(box.hook("Stop", "t")[0])
        box.wait_sender()
    out["Stop_due_launch"] = stats(due)
    out["sender_sync"] = stats([box.sender() for _ in range(3)])
    return out


def main() -> None:
    base = tmp_base()
    report: dict = {"cpu": "Apple M2 8 コア・8 GiB（ホスト。Docker は使わない）", "repeat": REPEAT}
    try:
        for pyname, py in PYS.items():
            for n in SPOOL_FILES:
                box = Box(base, f"{pyname}-{n}")
                box.py = py
                box.config(closed_port_url())
                fill(box, n)
                report[f"{pyname}/spool{n}"] = measure(box)
                print(pyname, n, report[f"{pyname}/spool{n}"], flush=True)
                shutil.rmtree(box.dir)
            # 退避されない queue.jsonl が大きい場合（config.json が無い版で起きる）
            box = Box(base, f"{pyname}-bigqueue")
            box.py = py
            box.config(closed_port_url())
            box.queue.write_bytes(b'{"kind":"event"}\n' * (50 * MB // 17))
            os.utime(box.queue)
            (box.data / "sent_at").touch()
            box.hook("PostToolUse", "warm")
            report[f"{pyname}/queue50MB"] = {
                "PostToolUse": stats([box.hook("PostToolUse", "t")[0] for _ in range(REPEAT)]),
                "Stop_not_due": stats([box.hook("Stop", "t")[0] for _ in range(REPEAT)]),
            }
            print(pyname, "bigqueue", report[f"{pyname}/queue50MB"], flush=True)
            shutil.rmtree(box.dir)
    finally:
        (LOCAL / "timing.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), "utf-8")
        shutil.rmtree(base, ignore_errors=True)


if __name__ == "__main__":
    main()
