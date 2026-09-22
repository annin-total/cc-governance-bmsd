"""shared.py が __file__ 起点でパスを解決することを、別プロセスで確かめる。

conftest.py が事前に sys.path を設定してしまうため、シムの検証にはならない。
このテストだけは PYTHONPATH に `cc-governance-bmsd-server` の絶対パスのみを与え、
カレントディレクトリを変えて `import shared` する別プロセスを起動する。
"""

import ast
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = ROOT / "cc-governance-bmsd-server"


def _run(cwd: Path, code: str) -> subprocess.CompletedProcess:
    """PYTHONPATH をサーバディレクトリだけに絞り、別プロセスで code を実行する。"""
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(cwd),
        # PATH を決め打ちすると Windows で成立しない。PYTHONDONTWRITEBYTECODE は、
        # 配布物である `plugin/` に `__pycache__` を残さないために渡す。
        env={
            "PATH": os.environ.get("PATH", ""),
            "PYTHONPATH": str(SERVER_DIR),
            "PYTHONDONTWRITEBYTECODE": "1",
        },
        capture_output=True,
        text=True,
        check=False,
    )


_HOOK_FIELDS_LEN_CODE = "import shared; print(len(shared.HOOK_FIELDS))"

_NAMES_CODE = (
    "import shared; "
    "print(sorted(n for n in "
    '("HOOK_FIELDS","EXTRA_COLUMNS","POLICY","POLICY_COLUMNS","CSV_COLUMNS",'
    '"dig","coerce","to_day","ddl") if hasattr(shared, n)))'
)


def test_import_from_root():
    """カレントディレクトリが `/` でも import shared が通る。"""
    result = _run(Path("/"), _HOOK_FIELDS_LEN_CODE)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "12"


def test_import_from_dev_repo_root():
    """カレントディレクトリが開発リポジトリのルートでも import shared が通る。"""
    result = _run(ROOT, _HOOK_FIELDS_LEN_CODE)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "12"


def test_import_from_server_dir():
    """カレントディレクトリが `cc-governance-bmsd-server/` でも import shared が通る。"""
    result = _run(SERVER_DIR, _HOOK_FIELDS_LEN_CODE)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "12"


def test_reexports_all_nine_names():
    """契約の 9 つの名前すべてが shared から見える。"""
    result = _run(Path("/"), _NAMES_CODE)
    assert result.returncode == 0, result.stderr
    names = ast.literal_eval(result.stdout.strip())
    expected = [
        "CSV_COLUMNS",
        "EXTRA_COLUMNS",
        "HOOK_FIELDS",
        "POLICY",
        "POLICY_COLUMNS",
        "coerce",
        "ddl",
        "dig",
        "to_day",
    ]
    assert names == expected
