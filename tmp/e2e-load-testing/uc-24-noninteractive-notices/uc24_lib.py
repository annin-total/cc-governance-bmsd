"""UC 24 の部品。偽の open・hook の入力と環境を記録する probe・一時ディレクトリ。

ブラウザを開かせないため、PATH の先頭に偽の `open`/`xdg-open` を置く（_browser.open_url は
macOS で `subprocess.Popen(["open", url])` を PATH 解決で呼ぶ）。
"""

import json
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
WT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WT / "e2e"))
assert os.environ.get("CC_E2E_RUN") == "a", "CC_E2E_RUN=a を付けて動かす"

BASE = Path(os.path.realpath(tempfile.mkdtemp(prefix="cc-e2e-a-24-")))
tempfile.tempdir = str(BASE)  # E2ERoot をこの下に作らせる
FAKEBIN = BASE / "fakebin"
OPEN_LOG = BASE / "open.log"
PROBE_LOG = BASE / "probe.jsonl"
PROBE = BASE / "probe_hook.py"
URL = "https://uc24.invalid/notice?a=1"
NOTICE_ID = "uc24-notice"

_FAKE = """#!/bin/sh
printf '%s\\t%s\\n' "$(basename "$0")" "$*" >> "{log}"
exit 0
"""
_PROBE = """import json, os, shutil, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except ValueError:
    data = {{}}
rec = {{
    "entrypoint": os.environ.get("CLAUDE_CODE_ENTRYPOINT", "<unset>"),
    "which_open": shutil.which("open"),
    "path_head": os.environ.get("PATH", "").split(os.pathsep)[0],
    "claude_env_keys": sorted(k for k in os.environ if k.startswith(("CLAUDE", "CC_"))),
    "stdin_keys": sorted(data) if isinstance(data, dict) else None,
    "source": data.get("source") if isinstance(data, dict) else None,
    "hook_event_name": data.get("hook_event_name") if isinstance(data, dict) else None,
}}
with open({log!r}, "a", encoding="utf-8") as f:
    f.write(json.dumps(rec) + "\\n")
print("{{}}")
"""


def setup_fakes() -> None:
    FAKEBIN.mkdir()
    for name in ("open", "xdg-open"):
        p = FAKEBIN / name
        p.write_text(_FAKE.format(log=OPEN_LOG), encoding="utf-8")
        p.chmod(p.stat().st_mode | stat.S_IXUSR)
    PROBE.write_text(_PROBE.format(log=str(PROBE_LOG)), encoding="utf-8")


def fake_path() -> str:
    return f"{FAKEBIN}{os.pathsep}{os.environ['PATH']}"


def notices(with_url: bool) -> bytes:
    n = {"id": NOTICE_ID, "title": "UC24 のお知らせ", "body": "非対話の検証用"}
    if with_url:
        n["url"] = URL
    return json.dumps([n], ensure_ascii=False).encode()


def read_lines(p: Path) -> list:
    try:
        return [line for line in p.read_text(encoding="utf-8").splitlines() if line]
    except FileNotFoundError:
        return []


def reset_logs() -> None:
    for p in (OPEN_LOG, PROBE_LOG):
        p.unlink(missing_ok=True)


def cleanup() -> None:
    p = BASE
    assert p.name.startswith("cc-e2e-a-24-") and not p.is_symlink()
    for d, _, files in os.walk(p):
        os.chmod(d, 0o755)
        for f in files:
            fp = Path(d) / f
            if not fp.is_symlink():
                os.chmod(fp, 0o644)
    shutil.rmtree(p)
