"""UC47 の部品: プラグインの一時コピー・隔離 env・spool の人工ファイル・hook と送信プロセスの起動。"""

import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Optional

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PLUGIN_SRC = REPO / "plugin"
LOCAL = REPO.parents[1] / "product/cc-governance-bmsd/.local/e2e-load-testing/uc-47-spool-limit"
DAY = 86400
MB = 1024 * 1024
PAD = "p" * 300


class Box:
    """1 端末ぶん: プラグインのコピーと状態の置き場。"""

    def __init__(self, base: Path, name: str) -> None:
        self.dir = base / name
        self.plugin = self.dir / "plugin"
        self.data = self.dir / "data"
        shutil.copytree(PLUGIN_SRC, self.plugin, ignore=shutil.ignore_patterns("__pycache__"))
        self.data.mkdir(parents=True)
        self.pycache = base / "pycache"
        self.py = "python3"

    @property
    def spool(self) -> Path:
        return self.data / "spool"

    @property
    def queue(self) -> Path:
        return self.data / "queue.jsonl"

    def config(self, url: str, token: str = "x", **extra) -> None:
        cfg = {"ingest_url": url, "ingest_token": token, "timeout_sec": 60,
               "spool_max_bytes": 5 * MB, "spool_max_days": 7, **extra}  # fmt: skip
        (self.plugin / "config.json").write_text(json.dumps(cfg), "utf-8")

    def env(self) -> dict:
        env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG") if k in os.environ}
        env.update(CLAUDE_PLUGIN_DATA=str(self.data), CLAUDE_PLUGIN_ROOT=str(self.plugin),
                   CC_GOVERNANCE_USER_EMAIL="uc47@example.invalid", NO_PROXY="127.0.0.1,localhost",
                   PYTHONPYCACHEPREFIX=str(self.pycache))  # fmt: skip
        return env

    def sender(self) -> float:
        """送信プロセスを同期で 1 回走らせ、かかった秒を返す。"""
        t0 = time.monotonic()
        subprocess.run([self.py, str(self.plugin / "hooks/_sender.py")], env=self.env(),
                       stdin=subprocess.DEVNULL, capture_output=True, timeout=600, check=True)  # fmt: skip
        return time.monotonic() - t0

    def hook(self, event: str, session_id: str) -> tuple:
        """collect.py を起動し (秒, 終了コード, 標準出力+標準エラー) を返す。"""
        stdin = json.dumps({"session_id": session_id, "hook_event_name": event})
        t0 = time.monotonic()
        res = subprocess.run([self.py, str(self.plugin / "hooks/collect.py"), event], env=self.env(),
                             input=stdin, capture_output=True, text=True, timeout=30)  # fmt: skip
        return time.monotonic() - t0, res.returncode, res.stdout + res.stderr

    def wait_sender(self, timeout: float = 60) -> None:
        """hook が切り離して起動した送信プロセスの終了を待つ。"""
        pat = str(self.plugin / "hooks/_sender.py")
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if subprocess.run(["pgrep", "-f", pat], capture_output=True).returncode != 0:
                return
            time.sleep(0.2)
        raise TimeoutError("送信プロセスが終わらない")

    def age_sent_at(self) -> None:
        """次の Stop で送信条件を満たすよう `sent_at` を消す。"""
        (self.data / "sent_at").unlink(missing_ok=True)

    def seed(self, tag: str, size: int, age_days: float = 0, epoch: Optional[int] = None,
             mtime: Optional[float] = None) -> Path:  # fmt: skip
        """`session_id=tag` の行で約 `size` バイトの spool ファイルを作り、mtime を過去にずらす。"""
        now = time.time()
        mt = mtime if mtime is not None else now - age_days * DAY
        name = f"{epoch if epoch is not None else int(mt)}-{uuid.uuid4().hex}.jsonl"
        self.spool.mkdir(parents=True, exist_ok=True)
        path = self.spool / name
        lines, total = [], 0
        while total < size:
            row = {"kind": "event", "event_id": str(uuid.uuid4()), "ts": int(mt), "session_id": tag,
                   "hook_event": "PostToolUse", "user_email": "uc47@example.invalid", "uc47_pad": PAD}  # fmt: skip
            line = json.dumps(row) + "\n"
            lines.append(line)
            total += len(line)
        path.write_text("".join(lines), "utf-8")
        os.utime(path, (mt, mt))
        return path

    def files(self) -> list:
        return sorted(p.name for p in self.spool.glob("*.jsonl")) if self.spool.is_dir() else []

    def spool_rows(self) -> list:
        rows = []
        for p in [*self.spool.glob("*.jsonl"), self.queue] if self.spool.is_dir() else [self.queue]:
            if p.exists():
                rows += [json.loads(x) for x in p.read_text("utf-8").splitlines() if x]
        return rows


def rows_of(path: Path) -> int:
    return sum(1 for _ in path.open("rb"))


def tmp_base() -> Path:
    return Path(os.path.realpath(tempfile.mkdtemp(prefix="cc-e2e-b-uc47-")))


def closed_port_url() -> str:
    import socket

    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return f"http://127.0.0.1:{port}/ingest"
