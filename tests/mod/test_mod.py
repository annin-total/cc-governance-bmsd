"""お知らせの mod のテスト（*.test.tsx と補助の world.tsx）を `claude plugin test` で走らせる。

`plugin/` は配布物でテストを置けないため、一時ディレクトリに写してテストを足してから走らせる。
"""

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
PLUGIN_DIR = ROOT / "plugin"
MOD_TESTS_DIR = Path(__file__).resolve().parent
CLAUDE = shutil.which("claude")
TIMEOUT_SEC = 300
# 本体が --plugin-dir の読み込みで書く生成物。写すと型の版が混ざる
_IGNORE = shutil.ignore_patterns("__pycache__", "tsconfig.json", "types")

pytestmark = pytest.mark.skipif(CLAUDE is None, reason="claude が見つからない")


def test_mod_tests_pass(tmp_path: Path) -> None:
    work = tmp_path / "plugin"
    shutil.copytree(PLUGIN_DIR, work, ignore=_IGNORE)
    (work / "tests").mkdir()
    sources = sorted(MOD_TESTS_DIR.glob("*.ts*"))
    assert any(p.name.endswith((".test.ts", ".test.tsx")) for p in sources)
    for path in sources:
        shutil.copy(path, work / "tests" / path.name)

    proc = subprocess.run(
        [CLAUDE, "plugin", "test", str(work)],
        check=False,
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SEC,
    )
    out = proc.stdout + proc.stderr
    assert proc.returncode == 0, out
    assert re.search(r"^\s*0 fail\s*$", out, re.MULTILINE), out
    passed = re.search(r"^\s*(\d+) pass\s*$", out, re.MULTILINE)
    assert passed and int(passed.group(1)) > 0, out
