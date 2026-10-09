#!/usr/bin/env python3
"""プラグインの差し込み前検証（上流の形式検証と、契約・標準ライブラリ・hook の exit 0・py39・お知らせの id の不変条件）。

「在ること」だけを見る。列名・キー・件数・設定値は見ない（頻繁に変わるため足さないこと）。
使い方: python scripts/validate_plugin.py [プラグインのディレクトリ名]（既定: plugin）
"""

import os
import sys
from pathlib import Path

# 検査項目を分けたパッケージを import しても、リポジトリに __pycache__ を作らない。
sys.dont_write_bytecode = True
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

from plugin_checks import files, hooks, report, tools


def main(argv: list) -> int:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    plugin_name = argv[1] if len(argv) > 1 else "plugin"
    plugin_dir = repo_root / plugin_name

    if not plugin_dir.is_dir():
        report.ng(f"プラグインディレクトリが存在しない: {plugin_dir}")
        return 1

    hooks_json = plugin_dir / "hooks" / "hooks.json"
    hook_commands = hooks.load_hook_commands(hooks_json)

    files.check_plugin_json(plugin_dir)
    tools.check_upstream_validate(plugin_dir)
    files.check_all_json_parse(plugin_dir)
    files.check_all_py_syntax(plugin_dir)
    files.check_notices_unique_ids(plugin_dir)
    hooks.check_hooks_json_files(hooks_json, hook_commands, plugin_dir)
    files.check_no_dev_artifacts(plugin_dir)
    tools.check_no_gitignored_files(repo_root, plugin_name)
    tools.check_contract_module(plugin_dir)
    files.check_stdlib_only(plugin_dir)
    hooks.check_hook_execution(hooks_json, hook_commands, plugin_dir)
    tools.check_ruff(repo_root, plugin_name)

    if report.FAIL:
        print("=== 検証に失敗した項目がある ===")
        return 1
    print("=== すべての検証に合格 ===")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
