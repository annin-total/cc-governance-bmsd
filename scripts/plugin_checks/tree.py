"""プラグインのファイルツリーの検査。"""

import json
import re
from pathlib import Path

from .common import ng, ok, run_text

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


def _is_dev_artifact(path: Path) -> bool:
    name = path.name
    if name in DEV_ARTIFACT_NAMES:
        return True
    if name.endswith(".pyc"):
        return True
    return any(p.match(name) for p in DEV_ARTIFACT_PATTERNS)


def check_plugin_json(plugin_dir: Path) -> None:
    """plugin.json の存在・パース可否・name/version の非空文字列を見る。"""
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


def check_all_json_parse(plugin_dir: Path) -> None:
    """プラグイン配下の全 *.json がパースできる。"""
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


def check_all_py_syntax(plugin_dir: Path) -> None:
    """プラグイン配下の全 *.py が構文として通る（バイトコードは書かない）。"""
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


def check_no_dev_artifacts(plugin_dir: Path) -> None:
    """開発用ファイルの混入が無い。"""
    found = [p for p in plugin_dir.rglob("*") if _is_dev_artifact(p)]
    if found:
        for a in sorted(found):
            ng(f"開発用ファイル/ディレクトリが混入: {a}")
    else:
        ok("開発用ファイル・生成物の混入なし")


def check_no_gitignored_files(repo_root: Path, plugin_name: str) -> None:
    """配布物が .gitignore に隠されていない。"""
    try:
        result = run_text(
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
    # .DS_Store / Thumbs.db は OS が作り直すノイズなので除く。
    ignored = [ln for ln in lines if Path(ln).name not in OS_NOISE_NAMES]
    if ignored:
        for i in ignored:
            ng(f"git に無視されているファイルが存在: {i}")
    else:
        ok("git に無視されているファイルは無い")
