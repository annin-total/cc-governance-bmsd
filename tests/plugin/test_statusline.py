"""`plugin/statusline/statusline.js` の出し分けと例外耐性を検証する。

node が無い環境では全テストを skip する。
"""

import json
import pathlib
import shutil
import subprocess
import tempfile

import pytest

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node が見つからない")

STATUSLINE_JS = (
    pathlib.Path(__file__).resolve().parents[2]
    / "plugin"
    / "statusline"
    / "statusline.js"
)
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _run(stdin_text: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [NODE, str(STATUSLINE_JS)],
        input=stdin_text,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )


def test_non_git_dir_prints_only_one_line():
    """git 管理下でないディレクトリでは 2 行目を出さない（空行も出さない）。"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        payload = {
            "model": {"display_name": "Sonnet"},
            "workspace": {"current_dir": tmp_dir},
        }
        result = _run(json.dumps(payload))

    assert result.returncode == 0
    lines = result.stdout.splitlines()
    assert len(lines) == 1
    assert "Sonnet" in lines[0]


def test_git_dir_prints_branch_line():
    payload = {
        "model": {"display_name": "Sonnet"},
        "workspace": {"current_dir": str(REPO_ROOT)},
    }
    result = _run(json.dumps(payload))

    assert result.returncode == 0
    lines = result.stdout.splitlines()
    assert len(lines) == 2
    assert lines[1]  # ブランチ名が入っている


def test_broken_json_exits_zero_without_crash():
    for broken_input in ["{not json", "", "null", "[]"]:
        result = _run(broken_input)
        assert result.returncode == 0
        assert result.stderr == ""
