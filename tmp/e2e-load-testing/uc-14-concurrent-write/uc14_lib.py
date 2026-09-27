"""UC 14 の部品: 隔離ルートの準備・段ごとのリセット・同時起動・状態の観測。"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "e2e"))
sys.path.insert(0, str(REPO / "tmp" / "e2e-load-testing" / "uc-06-policy-revoke"))

assert os.environ.get("CC_E2E_RUN") == "a", "CC_E2E_RUN=a を付けて動かす"
_orig = tempfile.mkdtemp
tempfile.mkdtemp = lambda suffix=None, prefix=None, dir=None: _orig(suffix, "cc-e2e-a-14-", dir)

from _flow import data_dir, install, install_path  # noqa: E402
from _market import version  # noqa: E402
from _root import hook_rows  # noqa: E402
from uc06_lib import AUTO_UPDATE, MARKETPLACE, ov, policy_src  # noqa: E402

AUTOCOMPACT = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"
ONCE_KEY = "env.UC14_ONCE"
DENY = "Read(./uc14-secret)"
POLICY = policy_src(
    set_={AUTOCOMPACT: "60"}, add={"permissions.deny": [DENY]}, once={ONCE_KEY: "first"}
)
USER = {
    "theme": "dark",
    "env": {"USER_KEEP": "keep-me"},
    "permissions": {"allow": ["Bash(ls:*)"], "deny": ["Bash(rm -rf /)"]},
    "uc14_user": {"marker": "user-value", "list": [1, 2, 3]},
}
FAKE_STAMP = "20000101-000000-000000"
# 起動の間隔（秒）。複数のターミナルを順に開く状況を模す。0 なら一斉
STAGGER_SEC = float(os.environ.get("UC14_STAGGER", "0"))


def setup(root, srv, extra_overrides: dict | None = None) -> bytes:
    """導入し、利用者の値を足した基準の settings.json を返す。偽の古いバックアップを 10 世代置く。"""
    install(root, srv, version(1), {**ov(POLICY), **(extra_overrides or {})})
    run_claude(root)  # data ディレクトリを本体に作らせる（直接起動の hook が使う）
    root.wait_quiet()
    s = root.config / "settings.json"
    data = json.loads(s.read_text(encoding="utf-8"))
    for k in (AUTOCOMPACT.split(".")[1], ONCE_KEY.split(".")[1]):
        data.get("env", {}).pop(k, None)
    data.get("permissions", {}).pop("deny", None)
    data.get("extraKnownMarketplaces", {}).get(MARKETPLACE, {}).pop("autoUpdate", None)
    for k, v in USER.items():
        data[k] = json.loads(json.dumps(v))
    base = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()
    bdir = root.config / "governance" / "backups"
    bdir.mkdir(parents=True, exist_ok=True)
    for old in bdir.glob("*"):
        old.unlink()
    for n in range(10):
        (bdir / f"settings-{FAKE_STAMP}-{n:02d}.json").write_text('{"fake": %d}\n' % n)
    return base


def reset(root, base: bytes) -> None:
    """設定を配布値の書き込みが要る状態に戻す。バックアップと利用ログは段をまたいで残す。"""
    root.wait_quiet()
    gov = root.config / "governance"
    (gov / "once.json").unlink(missing_ok=True)
    (gov / "statusline.js").unlink(missing_ok=True)
    (root.config / "settings.json").write_bytes(base)


class Poller(threading.Thread):
    """settings.json を読み続け、読めなかった回数と見えた版を数える（本体が読み捨てる瞬間の検出）。"""

    def __init__(self, path: Path) -> None:
        super().__init__(daemon=True)
        self.path, self.stop_ev = path, threading.Event()
        self.reads = self.bad = self.missing = 0
        self.bad_samples: list = []
        self.mtimes: set = set()

    def run(self) -> None:
        while not self.stop_ev.is_set():
            try:
                text = self.path.read_text(encoding="utf-8")
                self.mtimes.add(self.path.stat().st_mtime_ns)
                json.loads(text)
            except FileNotFoundError:
                self.missing += 1
            except ValueError:
                self.bad += 1
                if len(self.bad_samples) < 3:
                    self.bad_samples.append(text[:80])
            self.reads += 1
            time.sleep(0.002)


def launch_all(n: int, fn: Callable[[int], dict]) -> list:
    """n 本をバリアで揃えて同時に起動し、結果を返す。"""
    barrier = threading.Barrier(n)
    out: list = [None] * n

    def _one(i: int) -> None:
        barrier.wait()
        time.sleep(i * STAGGER_SEC)
        try:
            out[i] = fn(i)
        except Exception as e:  # noqa: BLE001 (1 本の失敗で段を止めない)
            out[i] = {"error": repr(e)}

    ts = [threading.Thread(target=_one, args=(i,)) for i in range(n)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    return out


def run_claude(root) -> dict:
    """未ログインの claude -p を 1 本。SessionStart の hook の結果を抜き出す。"""
    t = time.monotonic()
    res = root.run_claude(
        "-p", "ok", "--output-format", "stream-json", "--verbose", "--include-hook-events",
        timeout=240,
    )  # fmt: skip
    hooks = []
    for line in res.stdout.splitlines():
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if o.get("subtype") == "hook_response" and o.get("hook_event") == "SessionStart":
            hooks.append(
                {k: o.get(k) for k in ("exit_code", "outcome")}
                | {"stderr": str(o.get("stderr") or "")[:200]}
            )
    return {"rc": res.returncode, "sec": round(time.monotonic() - t, 2), "hooks": hooks,
            "stderr": res.stderr[-300:]}  # fmt: skip


def run_hook(root) -> dict:
    """claude を介さず SessionStart の hook を直接 1 本起動する（競合の窓を狭く揃えるため）。"""
    ip = install_path(root)
    env = root.env() | {"CLAUDE_PLUGIN_ROOT": str(ip), "CLAUDE_PLUGIN_DATA": str(data_dir(root))}
    inp = json.dumps({"hook_event_name": "SessionStart", "session_id": "uc14", "source": "startup"})
    t = time.monotonic()
    r = subprocess.run(
        ["python3", str(ip / "hooks" / "session_start.py"), "SessionStart"], input=inp,
        capture_output=True, text=True, env=env, cwd=root.project, timeout=60,
    )  # fmt: skip
    return {"rc": r.returncode, "sec": round(time.monotonic() - t, 2),
            "hooks": [{"exit_code": r.returncode, "outcome": "direct", "stderr": r.stderr[:200]}]}  # fmt: skip


def dig(d: Any, dotted: str) -> Any:
    for part in dotted.split("."):
        if not isinstance(d, dict) or part not in d:
            return "<missing>"
        d = d[part]
    return d


def loadavg() -> list:
    return [round(x, 2) for x in os.getloadavg()]


def mem_free_pct() -> str:
    r = subprocess.run(["memory_pressure"], capture_output=True, text=True)
    return r.stdout.strip().splitlines()[-1] if r.stdout else "?"


def rows_since(root, seen: set) -> list:
    rs = [r for r in hook_rows(data_dir(root)) if r.get("event_id") not in seen]
    seen.update(r.get("event_id") for r in rs)
    return rs
