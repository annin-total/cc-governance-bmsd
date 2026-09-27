"""errors の嵐（壊れた版が全 hook で失敗し続けた）を模して、errors に行を足す。`ndjson.ingest` を通す。

使い方: storm.py <DB> <日数> <1 日あたりの行数>  直近 <日数> 日に均等に入れる。
"""

import json
import os
import random
import sys
import time
import uuid
from pathlib import Path

SERVER = Path(__file__).resolve().parents[3] / "server"
sys.path.insert(0, str(SERVER))


def main() -> None:
    db_path, days, per_day = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    os.environ["DB_DSN"] = f"sqlite:///{db_path}"
    from ccgov.ingestion import ndjson
    from ccgov.store import db

    rng = random.Random(99)
    now = int(time.time())
    conn = db.connect()
    t = time.monotonic()
    total = 0
    for d in range(days):
        lines = []
        for i in range(per_day):
            u = rng.randrange(200)
            lines.append(json.dumps({
                "kind": "error", "event_id": str(uuid.UUID(int=rng.getrandbits(128), version=4)),
                "ts": now - d * 86400 - rng.randrange(36000), "user_email": f"u{u:03d}@example.com",
                "host": f"host-{u:03d}-a", "hook_event": "PostToolUse", "plugin_version": "1.3.1",
                "stage": "collect", "error_type": "KeyError",
            }))  # fmt: skip
        total += ndjson.ingest("\n".join(lines).encode(), conn)["stored"]
    db.analyze(conn)
    conn.close()
    print(json.dumps({"stored": total, "sec": round(time.monotonic() - t, 1)}))


if __name__ == "__main__":
    main()
