"""tests/plugin/client の共通 fixture。"""

import shutil
from pathlib import Path

import pytest

_PLUGIN_SRC = Path(__file__).resolve().parents[3] / "plugin"


@pytest.fixture
def hooks_dir(tmp_path) -> Path:
    """`plugin/hooks` と `config.json` を一時ディレクトリへ複製し、hooks ディレクトリを返す。"""
    hooks_dst = tmp_path / "plugin" / "hooks"
    shutil.copytree(
        _PLUGIN_SRC / "hooks", hooks_dst, ignore=shutil.ignore_patterns("__pycache__")
    )
    shutil.copy(_PLUGIN_SRC / "config.json", tmp_path / "plugin" / "config.json")
    return hooks_dst
