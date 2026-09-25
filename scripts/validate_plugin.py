#!/usr/bin/env python3
"""プラグインの差し込み前検証（形式と、契約・標準ライブラリ・hook の exit 0・py39 の不変条件）。

「在ること」だけを見る。列名・キー・件数・設定値は見ない（頻繁に変わるため足さないこと）。
使い方: python scripts/validate_plugin.py [プラグインのディレクトリ名]（既定: plugin）
"""

import ast
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional

os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

FAIL = False

DEV_ARTIFACT_NAMES = frozenset(
    {
        "__pycache__",
        ".pytest_cache",
        "conftest.py",
        ".git",
    }
)
DEV_ARTIFACT_PATTERNS = (re.compile(r"^test_.*\.py$"), re.compile(r".*_test\.py$"))
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

PLUGIN_ROOT_VAR_PATTERN = re.compile(r"\$\{CLAUDE_PLUGIN_ROOT\}/([^\s\"]+)")
HOOK_TIMEOUT_SECONDS = 5
ISOLATED_USER_EMAIL = "validate-plugin-py@example.invalid"


def ok(message: str) -> None:
    print(f"[OK] {message}")


def ng(message: str) -> None:
    """失敗を報告し、全体の失敗フラグを立てる。"""
    global FAIL
    print(f"[NG] {message}")
    FAIL = True


def skip(message: str) -> None:
    print(f"[SKIP] {message}")


def _is_dev_artifact(path: Path) -> bool:
    name = path.name
    if name in DEV_ARTIFACT_NAMES:
        return True
    if name.endswith(".pyc"):
        return True
    return any(p.match(name) for p in DEV_ARTIFACT_PATTERNS)


def _walk_hook_commands(node: object, out: list) -> None:
    """hooks.json のツリーから command 文字列を再帰的に集める。"""
    if isinstance(node, dict):
        cmd = node.get("command")
        if isinstance(cmd, str):
            out.append(cmd)
        for v in node.values():
            _walk_hook_commands(v, out)
    elif isinstance(node, list):
        for v in node:
            _walk_hook_commands(v, out)


# --- 1. plugin.json の存在・パース可否・name/version の非空文字列 ---
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


# --- 2. プラグイン配下の全 *.json がパースできる ---
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


# --- 3. プラグイン配下の全 *.py が構文として通る（バイトコードは書かない）---
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


# --- 4. hooks/hooks.json の各 command が指すファイルが実在する ---
def check_hooks_json_files(hooks_json: Path, plugin_dir: Path) -> None:
    if not hooks_json.is_file():
        ok("hooks/hooks.json は無い（検証対象外）")
        return
    try:
        with hooks_json.open(encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        ng(f"hooks.json のパースに失敗: {hooks_json}")
        return

    commands: list = []
    _walk_hook_commands(data, commands)

    missing: list = []
    for cmd in commands:
        for rel in PLUGIN_ROOT_VAR_PATTERN.findall(cmd):
            if not (plugin_dir / rel).is_file():
                missing.append(rel)

    if missing:
        for m in missing:
            ng(f"hooks.json が参照するファイルが実在しない: {m}")
    else:
        ok("hooks.json が参照するファイルはすべて実在する")


# --- 5. 開発用ファイルの混入なし ---
def check_no_dev_artifacts(plugin_dir: Path) -> None:
    found = [p for p in plugin_dir.rglob("*") if _is_dev_artifact(p)]
    if found:
        for a in sorted(found):
            ng(f"開発用ファイル/ディレクトリが混入: {a}")
    else:
        ok("開発用ファイル・生成物の混入なし")


# --- 6. git に無視されているファイルが無い ---
# 配布物が .gitignore に隠されていないかを見る。.DS_Store / Thumbs.db は OS が作り直すノイズなので除く。
def check_no_gitignored_files(repo_root: Path, plugin_name: str) -> None:
    try:
        result = subprocess.run(
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
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        lines = [ln for ln in result.stdout.splitlines() if ln.strip()]
    except OSError:
        lines = []

    ignored = [ln for ln in lines if Path(ln).name not in OS_NOISE_NAMES]
    if ignored:
        for i in ignored:
            ng(f"git に無視されているファイルが存在: {i}")
    else:
        ok("git に無視されているファイルは無い")


# --- 7. 契約の正本（hooks/contract.py）が import でき、決められた名前が在る ---
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
    result = subprocess.run(
        [sys.executable, "-c", check_code, contract_dir],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode == 0:
        ok("contract.py: import でき、契約の名前がすべて在る")
    else:
        ng("contract.py: import に失敗、または契約の名前が欠けている")


# --- 8. プラグイン配下の *.py が標準ライブラリだけで動く（pip install を要求しない） ---
def check_stdlib_only(plugin_dir: Path) -> None:
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


def _settings_hash(settings_path: Path) -> str:
    """無ければ MISSING。"""
    if not settings_path.is_file():
        return "MISSING"
    digest = hashlib.sha1()
    with settings_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _expand_plugin_root(command: str, plugin_dir: Path) -> str:
    return command.replace("${CLAUDE_PLUGIN_ROOT}", str(plugin_dir))


def _rmtree(path: Path) -> None:
    import shutil

    shutil.rmtree(path, ignore_errors=True)


def _run_hook_commands(hooks_json: Path, plugin_dir: Path) -> None:
    """hooks.json の各 command を隔離環境で実行し、exit 0・無出力を確かめる。"""
    try:
        with hooks_json.open(encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        ng(f"hooks.json のパースに失敗: {hooks_json}")
        return

    commands: list = []
    _walk_hook_commands(data, commands)

    isolation_dir = tempfile.mkdtemp(prefix="cc-governance-validate-")
    try:
        isolated_plugin_data = Path(isolation_dir) / "plugin-data"
        isolated_config_dir = Path(isolation_dir) / "config-dir"
        isolated_plugin_data.mkdir(parents=True, exist_ok=True)
        isolated_config_dir.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env["CLAUDE_PLUGIN_ROOT"] = str(plugin_dir)
        env["CLAUDE_PLUGIN_DATA"] = str(isolated_plugin_data)
        env["CLAUDE_CONFIG_DIR"] = str(isolated_config_dir)
        env["CC_GOVERNANCE_USER_EMAIL"] = ISOLATED_USER_EMAIL
        # 無効化スイッチを立てると hook が冒頭で return し、収集経路を通らずに合格してしまう。
        env.pop("CC_GOVERNANCE_DISABLE", None)
        # 対話を示す値を継承すると、hook がお知らせの URL を本物のブラウザで開く。
        env.pop("CLAUDE_CODE_ENTRYPOINT", None)
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        failed = False
        for cmd in commands:
            # `shlex.split(posix=True)` はバックスラッシュを食うため、Windows のパスを
            # スラッシュ区切りにしてから埋める。
            expanded = _expand_plugin_root(cmd, Path(plugin_dir.as_posix()))
            argv = shlex.split(expanded, posix=True)
            try:
                result = subprocess.run(
                    argv,
                    input="{}",
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=env,
                    timeout=HOOK_TIMEOUT_SECONDS,
                    check=False,
                )
                rc = result.returncode
                stderr_content = result.stderr
            except subprocess.TimeoutExpired:
                rc = -1
                stderr_content = "(timeout)"
            except OSError as exc:
                rc = -1
                stderr_content = str(exc)

            if rc != 0 or stderr_content:
                ng(f"hook が exit 0・無出力で終わらない（rc={rc}）: {cmd}")
                failed = True

        if not failed:
            ok("すべての hook が exit 0 で終わり、標準エラーに何も出さない")
    finally:
        _rmtree(Path(isolation_dir))


# --- 9. hook が常に exit 0 で終わり、標準エラーに何も出さない（隔離実行）---
# 利用者の実ファイルに触れうる唯一の検査なので、実 settings.json のハッシュを前後で比べる。
def check_hook_execution(hooks_json: Path, plugin_dir: Path) -> None:
    real_settings = Path.home() / ".claude" / "settings.json"
    hash_before = _settings_hash(real_settings)

    if hooks_json.is_file():
        _run_hook_commands(hooks_json, plugin_dir)
    else:
        skip("hook 実行検査: hooks/hooks.json が無い")

    hash_after = _settings_hash(real_settings)
    if hash_before == hash_after:
        ok("実 ~/.claude/settings.json は変更されていない（隔離が効いている）")
    else:
        ng("実 ~/.claude/settings.json が変更された（隔離が効いていない・重大）")


# --- 10. Python 3.9 で動く構文であること（ruff が使える場合のみ）---
def _find_ruff(repo_root: Path) -> Optional[str]:
    """ruff を PATH とリポジトリの仮想環境から探す。"""
    from shutil import which

    found = which("ruff")
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
        skip("ruff check: ruff が見つからない")
        return
    result = subprocess.run(
        [ruff, "check", plugin_name],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode == 0:
        ok("ruff check: py39 構文として妥当")
    else:
        ng("ruff check で py39 構文の問題を検出")


def main(argv: list) -> int:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    plugin_name = argv[1] if len(argv) > 1 else "plugin"
    plugin_dir = repo_root / plugin_name

    if not plugin_dir.is_dir():
        ng(f"プラグインディレクトリが存在しない: {plugin_dir}")
        return 1

    hooks_json = plugin_dir / "hooks" / "hooks.json"

    check_plugin_json(plugin_dir)
    check_all_json_parse(plugin_dir)
    check_all_py_syntax(plugin_dir)
    check_hooks_json_files(hooks_json, plugin_dir)
    check_no_dev_artifacts(plugin_dir)
    check_no_gitignored_files(repo_root, plugin_name)
    check_contract_module(plugin_dir)
    check_stdlib_only(plugin_dir)
    check_hook_execution(hooks_json, plugin_dir)
    check_ruff(repo_root, plugin_name)

    if FAIL:
        print("=== 検証に失敗した項目がある ===")
        return 1
    print("=== すべての検証に合格 ===")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
