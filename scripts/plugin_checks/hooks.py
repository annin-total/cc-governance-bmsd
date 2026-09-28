"""hooks/hooks.json の command に関わる検査。"""

import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from plugin_checks.report import ng, ok, run, skip

PLUGIN_ROOT_VAR_PATTERN = re.compile(r"\$\{CLAUDE_PLUGIN_ROOT\}/([^\s\"]+)")
HOOK_TIMEOUT_SECONDS = 5
ISOLATED_USER_EMAIL = "validate-plugin-py@example.invalid"
# plugin/hooks/_spool.py の _SENT_AT_FILENAME・_QUEUE_FILENAME・_SPOOL_DIRNAME と同じ名前
SENT_AT_FILENAME = "sent_at"
QUEUE_FILENAME = "queue.jsonl"
SPOOL_DIRNAME = "spool"


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


def load_hook_commands(hooks_json: Path) -> Optional[list]:
    """hooks.json の command 文字列を集める。読めない・パースできなければ None。"""
    try:
        with hooks_json.open(encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    commands: list = []
    _walk_hook_commands(data, commands)
    return commands


# --- hooks/hooks.json の各 command が指すファイルが実在する ---
def check_hooks_json_files(
    hooks_json: Path, commands: Optional[list], plugin_dir: Path
) -> None:
    if not hooks_json.is_file():
        ok("hooks/hooks.json は無い（検証対象外）")
        return
    if commands is None:
        ng(f"hooks.json のパースに失敗: {hooks_json}")
        return

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


def _settings_hash(settings_path: Path) -> str:
    """無ければ MISSING。"""
    if not settings_path.is_file():
        return "MISSING"
    digest = hashlib.sha1()
    with settings_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _count_rows(plugin_data: Path) -> int:
    """queue と spool の行数の和。送信プロセスが queue を spool へ移しても変わらない。"""
    paths = [plugin_data / QUEUE_FILENAME]
    paths += (plugin_data / SPOOL_DIRNAME).glob("*.jsonl")
    total = 0
    for path in paths:
        if path.is_file():
            with path.open("rb") as f:
                total += sum(1 for _ in f)
    return total


def _run_hook_commands(
    hooks_json: Path, commands: Optional[list], plugin_dir: Path
) -> None:
    """hooks.json の各 command を隔離環境で実行し、exit 0・無出力・行の追記を確かめる。"""
    if commands is None:
        ng(f"hooks.json のパースに失敗: {hooks_json}")
        return

    isolation_dir = tempfile.mkdtemp(prefix="cc-governance-validate-")
    try:
        isolated_plugin_data = Path(isolation_dir) / "plugin-data"
        isolated_config_dir = Path(isolation_dir) / "config-dir"
        isolated_plugin_data.mkdir(parents=True, exist_ok=True)
        isolated_config_dir.mkdir(parents=True, exist_ok=True)
        # 送信先は開発ツリーの config.json（本番の値）なので、送信済みの印を今の時刻で置き、
        # 送信プロセスを起動させない（_spool.should_send）。
        (isolated_plugin_data / SENT_AT_FILENAME).touch()

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
            expanded = cmd.replace(
                "${CLAUDE_PLUGIN_ROOT}", str(Path(plugin_dir.as_posix()))
            )
            argv = shlex.split(expanded, posix=True)
            rows_before = _count_rows(isolated_plugin_data)
            try:
                result = run(argv, input="{}", env=env, timeout=HOOK_TIMEOUT_SECONDS)
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
            # exit 0・無出力のまま収集だけが止まる壊れ方は、行が増えたかでしか見えない。
            elif _count_rows(isolated_plugin_data) <= rows_before:
                ng(f"hook が queue にも spool にも行を書かない: {cmd}")
                failed = True

        if not failed:
            ok("すべての hook が exit 0 で終わり、標準エラーに何も出さず、行を書く")
    finally:
        shutil.rmtree(isolation_dir, ignore_errors=True)


# --- hook が常に exit 0 で終わり、標準エラーに何も出さず、行を書く（隔離実行）---
# 利用者の実ファイルに触れうる唯一の検査なので、実 settings.json のハッシュを前後で比べる。
def check_hook_execution(
    hooks_json: Path, commands: Optional[list], plugin_dir: Path
) -> None:
    # 利用者が CLAUDE_CONFIG_DIR を設定していれば、実際に使われているのはその下の settings.json。
    real_config_dir = os.environ.get("CLAUDE_CONFIG_DIR")
    real_settings = (
        Path(real_config_dir) if real_config_dir else Path.home() / ".claude"
    ) / "settings.json"
    hash_before = _settings_hash(real_settings)

    if hooks_json.is_file():
        _run_hook_commands(hooks_json, commands, plugin_dir)
    else:
        skip("hook 実行検査: hooks/hooks.json が無い")

    hash_after = _settings_hash(real_settings)
    if hash_before == hash_after:
        ok(f"実 {real_settings} は変更されていない（隔離が効いている）")
    else:
        ng(f"実 {real_settings} が変更された（隔離が効いていない・重大）")
