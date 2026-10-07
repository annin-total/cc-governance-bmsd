"""`validate_plugin.py` の混入検査は、mod の開発で生じる生成物とテストを配布物から落とす。"""

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "scripts"))

from plugin_checks import files, report


def _check(tmp_path, monkeypatch, rel: str) -> bool:
    """`rel` のファイルを置いた配布物を検査し、NG なら真を返す。"""
    monkeypatch.setattr(report, "FAIL", False)
    target = tmp_path / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("", encoding="utf-8")
    files.check_no_dev_artifacts(tmp_path)
    return report.FAIL


@pytest.mark.parametrize(
    "rel",
    [
        "tsconfig.json",
        ".claude-plugin/types/claude-code.d.ts",
        "hooks/notices.test.ts",
        "hooks/notices.test.tsx",
        "node_modules/x/index.js",
        "hooks/__pycache__/a.pyc",
    ],
)
def test_生成物とテストはNG(tmp_path, monkeypatch, rel):
    assert _check(tmp_path, monkeypatch, rel)


@pytest.mark.parametrize(
    "rel",
    ["hooks/notices.tsx", "types/index.d.ts", "notices.json", "hooks/collect.py"],
)
def test_配布するファイルはOK(tmp_path, monkeypatch, rel):
    assert not _check(tmp_path, monkeypatch, rel)
