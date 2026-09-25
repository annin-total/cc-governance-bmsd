"""プラグインの Python コードの検査（契約・標準ライブラリ・py39 構文）。"""

import ast
import os
import shutil
import sys
from pathlib import Path
from typing import Optional

from .common import ng, ok, run_text, skip

CONTRACT_REQUIRED_NAMES = (
    "HOOK_FIELDS",
    "EXTRA_COLUMNS",
    "POLICY_COLUMNS",
    "CSV_COLUMNS",
    "dig",
    "coerce",
    "to_day",
    "ddl",
)


def check_contract_module(plugin_dir: Path) -> None:
    """契約の正本（contract.py）が import でき、決められた名前が在る（中身は見ない）。"""
    contract_py = next(plugin_dir.rglob("contract.py"), None)
    if contract_py is None:
        ng("契約の正本（contract.py）が見つからない")
        return

    contract_dir = str(contract_py.parent)
    check_code = (
        "import importlib, sys\n"
        "sys.path.insert(0, sys.argv[1])\n"
        "mod = importlib.import_module('contract')\n"
        f"required = {CONTRACT_REQUIRED_NAMES!r}\n"
        "missing = [n for n in required if not hasattr(mod, n)]\n"
        "sys.exit(1 if missing else 0)\n"
    )
    result = run_text([sys.executable, "-c", check_code, contract_dir])
    if result.returncode == 0:
        ok("contract.py: import でき、契約の名前がすべて在る")
    else:
        ng("contract.py: import に失敗、または契約の名前が欠けている")


def check_stdlib_only(plugin_dir: Path) -> None:
    """プラグイン配下の *.py が標準ライブラリだけで動く（pip install を要求しない）。"""
    stdlib_names = getattr(sys, "stdlib_module_names", None)
    if stdlib_names is None:
        skip(
            "標準ライブラリ判定: この python に sys.stdlib_module_names が無い（3.10 未満）"
        )
        return

    py_files = list(plugin_dir.rglob("*.py"))
    local_modules = {f.stem for f in py_files}

    failed = False
    for f in py_files:
        try:
            with f.open(encoding="utf-8") as fh:
                tree = ast.parse(fh.read(), filename=str(f))
        except (OSError, SyntaxError):
            continue

        bad_names: list = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    bad_names.append(alias.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom):
                if node.level and node.level > 0:
                    continue  # 相対importは常にローカル
                if node.module:
                    bad_names.append(node.module.split(".")[0])

        for name in bad_names:
            if name in stdlib_names or name in local_modules:
                continue
            ng(f"標準ライブラリ外の import: {name} ({f})")
            failed = True

    if not failed:
        ok("すべての *.py が標準ライブラリ（と自モジュール）だけで動く")


def _find_ruff(repo_root: Path) -> Optional[str]:
    """ruff を PATH とリポジトリの仮想環境から探す。"""
    found = shutil.which("ruff")
    if found:
        return found

    venv_bin = repo_root / ".venv" / "bin" / "ruff"
    if venv_bin.is_file() and os.access(str(venv_bin), os.X_OK):
        return str(venv_bin)

    venv_scripts = repo_root / ".venv" / "Scripts" / "ruff.exe"
    if venv_scripts.is_file():
        return str(venv_scripts)

    return None


def check_ruff(repo_root: Path, plugin_name: str) -> None:
    """Python 3.9 で動く構文である（ruff が無ければ NG）。"""
    ruff = _find_ruff(repo_root)
    if ruff is None:
        ng("ruff check: ruff が見つからない（検査できない）")
        return
    result = run_text([ruff, "check", plugin_name], cwd=str(repo_root))
    if result.returncode == 0:
        ok("ruff check: py39 構文として妥当")
    else:
        ng("ruff check で py39 構文の問題を検出")
