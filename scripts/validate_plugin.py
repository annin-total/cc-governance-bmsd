#!/usr/bin/env python3
"""プラグインの差し込み前検証（形式と、契約・標準ライブラリ・hook の exit 0・py39 の不変条件）。

「在ること」だけを見る。列名・キー・件数・設定値は見ない（頻繁に変わるため足さないこと）。
使い方: python scripts/validate_plugin.py [プラグインのディレクトリ名]（既定: plugin）
"""

import os
import sys
from pathlib import Path

os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True

# 検査パッケージの __pycache__ を作らないため、バイトコード抑止の後に import する。
from plugin_checks import common
from plugin_checks.hooks import (
    check_hook_execution,
    check_hooks_json_files,
    load_hook_commands,
)
from plugin_checks.python import (
    check_contract_module,
    check_ruff,
    check_stdlib_only,
)
from plugin_checks.tree import (
    check_all_json_parse,
    check_all_py_syntax,
    check_no_dev_artifacts,
    check_no_gitignored_files,
    check_plugin_json,
)


def main(argv: list) -> int:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    plugin_name = argv[1] if len(argv) > 1 else "plugin"
    plugin_dir = repo_root / plugin_name

    if not plugin_dir.is_dir():
        common.ng(f"プラグインディレクトリが存在しない: {plugin_dir}")
        return 1

    hooks_json = plugin_dir / "hooks" / "hooks.json"
    hook_commands = load_hook_commands(hooks_json)

    check_plugin_json(plugin_dir)
    check_all_json_parse(plugin_dir)
    check_all_py_syntax(plugin_dir)
    check_hooks_json_files(hooks_json, hook_commands, plugin_dir)
    check_no_dev_artifacts(plugin_dir)
    check_no_gitignored_files(repo_root, plugin_name)
    check_contract_module(plugin_dir)
    check_stdlib_only(plugin_dir)
    check_hook_execution(hooks_json, hook_commands, plugin_dir)
    check_ruff(repo_root, plugin_name)

    if common.FAIL:
        print("=== 検証に失敗した項目がある ===")
        return 1
    print("=== すべての検証に合格 ===")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
