"""外部のプロセスで確かめる検査。"""

import os
import shutil
import sys
from pathlib import Path
from typing import Optional

from plugin_checks.report import ng, ok, run

OS_NOISE_NAMES = frozenset({".DS_Store", "Thumbs.db"})

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


# --- git に無視されているファイルが無い ---
# 配布物が .gitignore に隠されていないかを見る。.DS_Store / Thumbs.db は OS が作り直すノイズなので除く。
def check_no_gitignored_files(repo_root: Path, plugin_name: str) -> None:
    try:
        result = run(
            [
                "git",
                "-C",
                str(repo_root),
                "ls-files",
                "--others",
                "--ignored",
                "--exclude-standard",
                "--",
                plugin_name,
            ]
        )
    except OSError:
        ng("git に無視されているファイルを検査できない（git を実行できない）")
        return
    # 検査できなかったことを合格にしない（git 管理外のツリーでは returncode が 0 以外になる）。
    if result.returncode != 0:
        ng(f"git に無視されているファイルを検査できない（rc={result.returncode}）")
        return

    lines = [ln for ln in result.stdout.splitlines() if ln.strip()]
    ignored = [ln for ln in lines if Path(ln).name not in OS_NOISE_NAMES]
    if ignored:
        for i in ignored:
            ng(f"git に無視されているファイルが存在: {i}")
    else:
        ok("git に無視されているファイルは無い")


# --- 契約の正本（hooks/contract.py）が import でき、決められた名前が在る ---
# 中身（列名・キー・件数）は見ない。「在ること」だけを見る。
def check_contract_module(plugin_dir: Path) -> None:
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
    result = run([sys.executable, "-c", check_code, contract_dir])
    if result.returncode == 0:
        ok("contract.py: import でき、契約の名前がすべて在る")
    else:
        ng("contract.py: import に失敗、または契約の名前が欠けている")


# --- Python 3.9 で動く構文であること（ruff が無ければ NG）---
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
    ruff = _find_ruff(repo_root)
    if ruff is None:
        ng("ruff check: ruff が見つからない（検査できない）")
        return
    result = run([ruff, "check", plugin_name], cwd=str(repo_root))
    if result.returncode == 0:
        ok("ruff check: py39 構文として妥当")
    else:
        ng("ruff check で py39 構文の問題を検出")
