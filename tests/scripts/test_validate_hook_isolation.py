"""`validate_plugin.py` の hook 実行の検査は、送信先があっても送信しない。"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "scripts"))

from plugin_checks import hooks, report

_WAIT_SEC = 2


def test_hook実行の検査は送信先を入れてもPOSTしない(
    tmp_path, monkeypatch, ingest_receiver
):
    plugin_dir = tmp_path / "plugin"
    shutil.copytree(
        _ROOT / "plugin", plugin_dir, ignore=shutil.ignore_patterns("__pycache__")
    )
    config_path = plugin_dir / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config.update(ingest_url=ingest_receiver.url, ingest_token="t")
    config_path.write_text(json.dumps(config), encoding="utf-8")
    # 隔離ディレクトリを tmp_path の下に作らせて残し、hook が行を積んだことを後で見る
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    monkeypatch.setattr(hooks.shutil, "rmtree", lambda *_a, **_k: None)
    monkeypatch.setattr(report, "FAIL", False)

    hooks_json = plugin_dir / "hooks" / "hooks.json"
    hooks._run_hook_commands(
        hooks_json, hooks.load_hook_commands(hooks_json), plugin_dir
    )

    assert not report.FAIL
    assert ingest_receiver.received(within=_WAIT_SEC) == 0
    (isolation,) = tmp_path.glob("cc-governance-validate-*")
    # Stop の行が送られずに残っていること。無いと「POST しない」が空振りで通る
    queue = (isolation / "plugin-data" / "queue.jsonl").read_text(encoding="utf-8")
    assert '"Stop"' in queue
