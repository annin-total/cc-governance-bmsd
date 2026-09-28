"""`validate_plugin.py` の検査は、壊れたプラグインで NG になる。"""

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "scripts"))

from plugin_checks import files, hooks, report


def test_標準ライブラリと同じ名前のモジュールがあればNG(tmp_path, monkeypatch):
    monkeypatch.setattr(report, "FAIL", False)
    (tmp_path / "hooks").mkdir()
    (tmp_path / "hooks" / "json.py").write_text("x = 1\n", encoding="utf-8")

    files.check_stdlib_only(tmp_path)

    assert report.FAIL


def test_標準ライブラリの一覧が無いpythonで実行するとNG(tmp_path, monkeypatch):
    monkeypatch.setattr(report, "FAIL", False)
    monkeypatch.delattr(sys, "stdlib_module_names")

    files.check_stdlib_only(tmp_path)

    assert report.FAIL


def test_行を書かないhookはNG(tmp_path, monkeypatch):
    monkeypatch.setattr(report, "FAIL", False)
    hooks_dir = tmp_path / "hooks"
    hooks_dir.mkdir()
    (hooks_dir / "noop.py").write_text("", encoding="utf-8")
    hooks_json = hooks_dir / "hooks.json"
    command = f'"{sys.executable}" "${{CLAUDE_PLUGIN_ROOT}}/hooks/noop.py"'
    hooks_json.write_text(
        json.dumps({"hooks": {"Stop": [{"hooks": [{"command": command}]}]}}),
        encoding="utf-8",
    )

    hooks._run_hook_commands(hooks_json, hooks.load_hook_commands(hooks_json), tmp_path)

    assert report.FAIL
