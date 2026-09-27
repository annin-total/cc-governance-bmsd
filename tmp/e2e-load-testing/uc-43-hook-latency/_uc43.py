"""UC43 の一時スクリプトが共有する部品（計時・負荷の記録・隔離ルートの用意）。"""

import json
import os
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "e2e"))

from _flow import install, install_path  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import version  # noqa: E402
from _root import E2ERoot  # noqa: E402

LOCAL = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-43-hook-latency"
)
HEAVY_LOCK = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/work/"
    "e2e-load-testing/heavy.lock"
)
FIXTURES = REPO / "tests" / "fixtures" / "hook_inputs"
SLEEP_LINE = "import time as _t; _t.sleep(0.5)\n"


def load() -> dict:
    """1 分の load average と heavy.lock の有無。"""
    return {"load1": round(os.getloadavg()[0], 2), "heavy": HEAVY_LOCK.exists()}


def timed(fn) -> dict:
    """fn() を計時し、前後の負荷と一緒に返す。"""
    before = load()
    t0 = time.perf_counter()
    extra = fn()
    dt = time.perf_counter() - t0
    return {"sec": round(dt, 4), "before": before, "after": load(), "extra": extra}


def summary(samples: list) -> dict:
    """秒の列の中央値・p90・最小・最大。"""
    xs = sorted(samples)
    p90 = xs[min(len(xs) - 1, int(round(0.9 * (len(xs) - 1))))]
    return {
        "n": len(xs),
        "median": round(statistics.median(xs), 3),
        "p90": round(p90, 3),
        "min": round(xs[0], 3),
        "max": round(xs[-1], 3),
    }


def inject_sleep(src: str) -> str:
    """`def main() -> None:` の本体の先頭に 0.5 秒の sleep を入れる。"""
    head = "def main() -> None:\n"
    assert src.count(head) == 1, "main が見つからない"
    return src.replace(head, head + "    " + SLEEP_LINE)


class Installed:
    """プラグインを導入した隔離ルート（git 配信を計測中も生かしておく）。"""

    def __init__(self, n: int, overrides: dict = None) -> None:
        self.root = E2ERoot()
        self.gitsrv = GitHttpServer(self.root.srv)
        install(self.root, self.gitsrv, version(n), overrides or {})
        self.install_path = install_path(self.root)

    def close(self) -> None:
        self.gitsrv.close()
        self.root.cleanup()


def dump(name: str, data) -> Path:
    LOCAL.mkdir(parents=True, exist_ok=True)
    path = LOCAL / name
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return path
