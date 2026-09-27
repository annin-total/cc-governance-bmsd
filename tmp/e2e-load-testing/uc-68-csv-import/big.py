"""UC68: 実 CSV を複製した大きな CSV の取込時間とメモリ。heavy.lock を取ってから CC_E2E_RUN=b-uc68 で実行する。"""

import sys
from pathlib import Path

sys.path[:0] = [
    str(Path(__file__).resolve().parents[3] / "e2e"),
    str(Path(__file__).resolve().parent),
]

import json
import threading
import time
from datetime import date, timedelta

from _root import E2ERoot
from _server import DockerServer, build_context, docker
from lab import JULY, OUT, db_summary, do_import, place, read_rows, reset, to_bytes

SIZES = [int(x) for x in sys.argv[1:]] or [50_000, 200_000, 500_000]
_TIMEOUT = 1800


def grow(rows: list, n: int) -> list:
    """月をずらし（12 か月で一巡）、12 巡ごとに利用者を別名にして `n` 行にする。日は 1 年分に収める。"""
    h = rows[0]
    di, ei = h.index("Date"), h.index("User Email")
    out, k = [h], 0
    while len(out) - 1 < n:
        shift, gen = timedelta(days=31 * (k % 12)), k // 12
        for r in rows[1:]:
            r = list(r)
            r[di] = (date.fromisoformat(r[di]) + shift).isoformat()
            local, dom = r[ei].split("@")
            r[ei] = f"{local}g{gen}@{dom}"
            out.append(r)
            if len(out) - 1 == n:
                break
        k += 1
    return out


class MemPeak(threading.Thread):
    """docker stats を 1 秒ごとに読み、コンテナのメモリの最大値（MiB）を控える。"""

    def __init__(self, name: str) -> None:
        super().__init__(daemon=True)
        self.name_, self.peak, self.stop = name, 0.0, threading.Event()

    def run(self) -> None:
        while not self.stop.is_set():
            res = docker(
                "stats",
                "--no-stream",
                "--format",
                "{{.MemUsage}}",
                self.name_,
                check=False,
            )
            used = res.stdout.split("/")[0].strip()
            for unit, mul in (("GiB", 1024), ("MiB", 1), ("KiB", 1 / 1024)):
                if used.endswith(unit):
                    self.peak = max(self.peak, float(used[: -len(unit)]) * mul)
            time.sleep(1)


def measure(srv: DockerServer, n: int, base: list) -> dict:
    reset(srv)
    data = to_bytes(grow(base, n))
    place(srv, f"big{n}", {"big.csv": data})
    mem = MemPeak(srv.name)
    mem.start()
    first = do_import(srv, _TIMEOUT)
    second = do_import(srv, _TIMEOUT)
    mem.stop.set()
    mem.join()
    t0 = time.monotonic()
    st, body, _ = srv.request("GET", srv.admin_path("/"), auth=True)
    res = {
        "rows": n, "bytes": len(data), "import1_sec": first["sec"], "import1": first["ok"] or first["err"] or first["status"],
        "import2_sec": second["sec"], "mem_peak_mib": round(mem.peak), "overview_status": st,
        "overview_sec": round(time.monotonic() - t0, 3), "overview_bytes": len(body), "db": db_summary(srv),
    }  # fmt: skip
    print(json.dumps(res, ensure_ascii=False, default=str))
    (OUT / "stage" / f"big{n}" / "big.csv").unlink()
    return res


def main() -> None:
    base = read_rows(JULY)
    root = E2ERoot()
    srv = DockerServer(root, "uc68big")
    out = []
    try:
        srv.start(build_context(root, "uc68big"))
        srv.wait_ready()
        for n in SIZES:
            out.append(measure(srv, n, base))
            if srv.exit_code() is not None:
                print("サーバが止まった:", srv.logs()[-2000:])
                break
    finally:
        (OUT / "big.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=1, default=str)
        )
        srv.close()
        root.cleanup()


if __name__ == "__main__":
    main()
