"""プラグイン配下のファイルを読むだけで済む検査。"""

import ast
import json
import re
import sys
from pathlib import Path

from plugin_checks.report import ng, ok

DEV_ARTIFACT_NAMES = frozenset(
    {
        "__pycache__",
        ".pytest_cache",
        "conftest.py",
        ".git",
        "node_modules",
        # 本体が --plugin-dir で mod を読み込むとプラグインの直下に書く
        "tsconfig.json",
    }
)
DEV_ARTIFACT_PATTERNS = (
    re.compile(r"^test_.*\.py$"),
    re.compile(r".*_test\.py$"),
    re.compile(r".*\.test\.tsx?$"),
)
# 本体が --plugin-dir で mod を読み込むと書く型定義の置き場（プラグインのルートからの相対）
DEV_ARTIFACT_DIRS = (Path(".claude-plugin") / "types",)


# --- plugin.json の存在・パース可否・name/version の非空文字列 ---
def check_plugin_json(plugin_dir: Path) -> None:
    plugin_json = plugin_dir / ".claude-plugin" / "plugin.json"
    if not plugin_json.is_file():
        ng(f"plugin.json が存在しない: {plugin_json}")
        return
    try:
        with plugin_json.open(encoding="utf-8") as f:
            data = json.load(f)
        name = data.get("name")
        version = data.get("version")
        valid = (
            isinstance(name, str)
            and name.strip()
            and isinstance(version, str)
            and version.strip()
        )
    except (OSError, ValueError):
        valid = False
    if valid:
        ok("plugin.json: パース可能かつ name/version が非空")
    else:
        ng("plugin.json: パース不可、または name/version が空・非文字列")


# --- プラグイン配下の全 *.json がパースできる ---
def check_all_json_parse(plugin_dir: Path) -> None:
    failed = False
    for f in plugin_dir.rglob("*.json"):
        try:
            with f.open(encoding="utf-8") as fh:
                json.load(fh)
        except (OSError, ValueError):
            ng(f"JSON パース失敗: {f}")
            failed = True
    if not failed:
        ok("すべての *.json がパース可能")


# --- プラグイン配下の全 *.py が構文として通る（バイトコードは書かない）---
def check_all_py_syntax(plugin_dir: Path) -> None:
    failed = False
    for f in plugin_dir.rglob("*.py"):
        try:
            with f.open(encoding="utf-8") as fh:
                source = fh.read()
            compile(source, str(f), "exec")
        except (OSError, SyntaxError, ValueError):
            ng(f"Python 構文エラー: {f}")
            failed = True
    if not failed:
        ok("すべての *.py が構文として妥当")


def _is_dev_artifact(path: Path) -> bool:
    name = path.name
    if name in DEV_ARTIFACT_NAMES:
        return True
    if name.endswith(".pyc"):
        return True
    return any(p.match(name) for p in DEV_ARTIFACT_PATTERNS)


# --- 開発用ファイルの混入なし ---
def check_no_dev_artifacts(plugin_dir: Path) -> None:
    found = [p for p in plugin_dir.rglob("*") if _is_dev_artifact(p)]
    found += [plugin_dir / d for d in DEV_ARTIFACT_DIRS if (plugin_dir / d).exists()]
    if found:
        for a in sorted(found):
            ng(f"開発用ファイル/ディレクトリが混入: {a}")
    else:
        ok("開発用ファイル・生成物の混入なし")


# --- プラグイン配下の *.py が標準ライブラリだけで動く（pip install を要求しない） ---
def check_stdlib_only(plugin_dir: Path) -> None:
    stdlib_names = getattr(sys, "stdlib_module_names", None)
    if stdlib_names is None:
        ng(
            "標準ライブラリ判定: この python に sys.stdlib_module_names が無い。"
            "3.10 以上の python で実行する"
        )
        return

    py_files = list(plugin_dir.rglob("*.py"))
    local_modules = {f.stem for f in py_files}

    failed = False
    # 同名の自モジュールは hook のディレクトリで標準ライブラリを覆い隠し、hook が無言で壊れる。
    for f in py_files:
        if f.stem in stdlib_names:
            ng(f"標準ライブラリと同じ名前のモジュール: {f}")
            failed = True

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
