"""UC 06 の一時スクリプトが共有する部品。e2e/ の部品を import して、隔離ルートと git 配信を組む。"""

import contextlib
import json
import os
import sys
import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Callable, Optional

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "e2e"))

import _root
from _flow import data_dir, install, ok, session
from _githttp import GitHttpServer
from _market import MARKETPLACE, PLUGIN_ID, publish, version
from _root import E2ERoot, hook_rows

assert os.environ.get("CC_E2E_RUN") == "a", "CC_E2E_RUN=a を付けて動かす"
_PREFIX = "cc-e2e-a-06-"
_orig_mkdtemp = tempfile.mkdtemp


def _mkdtemp(*args: Any, **kw: Any) -> str:
    kw["prefix"] = _PREFIX
    return _orig_mkdtemp(*args, **kw)


_root.tempfile.mkdtemp = _mkdtemp  # E2ERoot の一時ディレクトリ名を UC 固有にする
TRACES: list = []
AUTO_UPDATE = f"extraKnownMarketplaces.{MARKETPLACE}.autoUpdate"


@contextlib.contextmanager
def env() -> Iterator[tuple]:
    r = E2ERoot()
    srv = GitHttpServer(r.srv)
    TRACES.extend([r.path.name, f"127.0.0.1:{srv.port}"])
    try:
        yield r, srv
    finally:
        srv.close()
        r.cleanup()


def policy_src(
    set_: Optional[dict] = None,
    add: Optional[dict] = None,
    remove: Optional[dict] = None,
    once: Optional[dict] = None,
) -> bytes:
    """policy.py の中身。SET には本物の autoUpdate を必ず含める。"""
    s = {AUTO_UPDATE: True, **(set_ or {})}
    body = (
        "from typing import Any\n"
        f"SET: dict[str, Any] = {s!r}\n"
        f"ADD: dict[str, list] = {add or {}!r}\n"
        f"REMOVE: dict[str, list] = {remove or {}!r}\n"
        f"ONCE: dict[str, Any] = {once or {}!r}\n"
    )
    return body.encode()


def ov(pol: bytes) -> dict:
    """UC06_MUTANT に壊した _policy_ops.py のパスがあれば、それも配る（判定がゲートするかの確認用）。"""
    out = {"hooks/policy.py": pol}
    if os.environ.get("UC06_MUTANT"):
        out["hooks/_policy_ops.py"] = Path(os.environ["UC06_MUTANT"]).read_bytes()
    return out


def settings(root: E2ERoot) -> dict:
    return root.json("settings.json")


def edit_settings(root: E2ERoot, fn: Callable[[dict], None]) -> None:
    """利用者の手編集を模す。"""
    p = root.config / "settings.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    fn(data)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def upgrade(root: E2ERoot, ver: str, pol: bytes) -> None:
    publish(root, ver, ov(pol))
    ok(root, "plugin", "marketplace", "update", MARKETPLACE)
    ok(root, "plugin", "update", PLUGIN_ID)


def installed_version(root: E2ERoot) -> list:
    rec = root.json("plugins/installed_plugins.json")["plugins"].get(PLUGIN_ID, [])
    return [e["version"] for e in rec]


def policy_rows(root: E2ERoot) -> list:
    return [r for r in hook_rows(data_dir(root)) if r["kind"] == "policy"]


def new_rows(root: E2ERoot, seen: set) -> list:
    rows = [r for r in policy_rows(root) if r["event_id"] not in seen]
    seen.update(r["event_id"] for r in rows)
    return [
        {k: r[k] for k in ("key_name", "value", "prev_value", "apply_result", "plugin_version")}
        for r in rows
    ]


def real_leaks() -> list:
    """本物の config に今回の痕跡が残っていないか（conftest._leaks と同じ観点）。"""
    found = []
    for d in _root.REAL_CONFIG_DIRS:
        for rel in ("settings.json", "plugins/installed_plugins.json", "plugins/known_marketplaces.json"):
            try:
                text = (d / rel).read_text(encoding="utf-8")
            except FileNotFoundError:
                continue
            found += [f"{d / rel}: {t}" for t in TRACES if t in text]
    return found


__all__ = [
    "AUTO_UPDATE",
    "MARKETPLACE",
    "PLUGIN_ID",
    "data_dir",
    "edit_settings",
    "env",
    "install",
    "installed_version",
    "new_rows",
    "ok",
    "ov",
    "policy_rows",
    "policy_src",
    "publish",
    "real_leaks",
    "session",
    "settings",
    "upgrade",
    "version",
]
