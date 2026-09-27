"""判定がゲートしているかの確認（壊した入力で落ちることを見る）。使い捨て。

session_start.py の disabled チェックを外した mutant を配り、run.py の A1 相当の判定
（disable=1 で kinds が ['policy'] だけ）が落ちることを確かめる。
"""

import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
WT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WT / "e2e"))
BASE = tempfile.mkdtemp(prefix="cc-e2e-a-41-gate-", dir=tempfile.gettempdir())
tempfile.tempdir = BASE

from _flow import data_dir, install, session  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import MARKETPLACE, version  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402

AUTO = f"extraKnownMarketplaces.{MARKETPLACE}.autoUpdate"
POLICY = (
    "from typing import Any\n"
    f"SET: dict[str, Any] = {{{AUTO!r}: True}}\n"
    "ADD: dict[str, list] = {}\nREMOVE: dict[str, list] = {}\nONCE: dict[str, Any] = {}\n"
).encode()
MUTANT = Path("/tmp/mutant_session_start.py").read_bytes()

root = E2ERoot()
git = GitHttpServer(root.srv)
try:
    install(root, git, version(1), {"hooks/policy.py": POLICY, "hooks/session_start.py": MUTANT})
    lines = session(root, {"CC_GOVERNANCE_DISABLE": "1"})
    rows = hook_rows(data_dir(root))
    kinds = sorted({r["kind"] for r in rows})
    print(f"mutant: disable=1 なのに kinds={kinds}")
    if kinds == ["policy"]:
        print("GATE NG: mutant でも判定が落ちない（判定が無効化を見ていない）")
        sys.exit(1)
    print("GATE OK: mutant では判定が落ちる（event 行が混ざる）→ run.py の判定は有効")
finally:
    git.close()
    root.cleanup()
