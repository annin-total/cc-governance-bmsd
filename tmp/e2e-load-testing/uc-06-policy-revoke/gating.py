"""既存の e2e/test_settings.py の判定が、ADD・REMOVE・SET の None と、それらを壊した実装でゲートするかを見る。

pytest を使わず、テスト関数に隔離ルートと git 配信を渡して直接呼ぶ。policy.py（と壊した _policy_ops.py）を
差し替えた plugin/ の複製を、_market.PLUGIN_SRC に差し込んで配る。開発ツリーの plugin/ には触れない。
"""

import json
import shutil
import sys
import tempfile
import traceback
from pathlib import Path

from uc06_lib import REPO, env, policy_src, real_leaks  # e2e/ を sys.path に足す

# isort: split
import _market
import test_settings as ts

HERE = Path(__file__).resolve().parent
R1 = "Read(./cc-e2e-r1)"
REAL_SET = {"env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"}
VARIANTS = {
    "base": (policy_src(set_=REAL_SET), None),
    "set_none": (policy_src(set_={**REAL_SET, "env.CC_E2E_REVOKE": None}), None),
    "add": (policy_src(set_=REAL_SET, add={"permissions.deny": [R1]}), None),
    "remove": (policy_src(set_=REAL_SET, remove={"permissions.deny": [R1]}), None),
    "set_none+mutant_none_noop": (policy_src(set_={**REAL_SET, "env.CC_E2E_REVOKE": None}), "mutant_none_noop.py"),
    "remove+mutant_remove_noop": (policy_src(set_=REAL_SET, remove={"permissions.deny": [R1]}), "mutant_remove_noop.py"),
}
TESTS = (ts.test_SETが入り本体の書き込みも残る, ts.test_2回目は適用済みで本体に取り込まれる)


def _src(tmp: Path, pol: bytes, mutant) -> Path:
    dest = tmp / "plugin"
    shutil.copytree(REPO / "plugin", dest, ignore=shutil.ignore_patterns(*_market.EXCLUDE))
    (dest / "hooks" / "policy.py").write_bytes(pol)
    if mutant:
        shutil.copy(HERE / mutant, dest / "hooks" / "_policy_ops.py")
    return dest


def main() -> None:
    names = sys.argv[1:] or list(VARIANTS)
    table: dict = {}
    orig = _market.PLUGIN_SRC
    for name in names:
        pol, mutant = VARIANTS[name]
        tmp = Path(tempfile.mkdtemp(prefix="cc-e2e-a-06-src-"))
        try:
            _market.PLUGIN_SRC = _src(tmp, pol, mutant)
            for t in TESTS:
                with env() as (root, srv):
                    try:
                        t(root, srv)
                        res = "PASS"
                    except AssertionError as e:
                        line = traceback.extract_tb(e.__traceback__)[-1]
                        res = f"FAIL at test_settings.py:{line.lineno}: {line.line}"
                    except Exception:
                        res = "ERROR: " + traceback.format_exc()[-500:]
                table.setdefault(name, {})[t.__name__] = res
                print(f"{name:28s} {t.__name__}: {res}", flush=True)
        finally:
            _market.PLUGIN_SRC = orig
            shutil.rmtree(tmp)
    print("leaks:", real_leaks())
    print(json.dumps(table, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
