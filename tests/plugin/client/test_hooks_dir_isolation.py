"""開発ツリーの `config.json` に送信先があっても、`hooks_dir` で動かす hook は送信しない。"""

import json
import shutil
from pathlib import Path

import pytest

_REAL_PLUGIN = Path(__file__).resolve().parents[3] / "plugin"
_WAIT_SEC = 2


@pytest.fixture
def plugin_src(tmp_path_factory, ingest_receiver) -> Path:
    """送信先にローカルの受け口を入れた `plugin/` の複製（開発ツリーに本番の値がある状態の代わり）。"""
    src = tmp_path_factory.mktemp("src") / "plugin"
    shutil.copytree(_REAL_PLUGIN, src, ignore=shutil.ignore_patterns("__pycache__"))
    config_path = src / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config.update(ingest_url=ingest_receiver.url, ingest_token="t")
    config_path.write_text(json.dumps(config), encoding="utf-8")
    return src


def test_送信先だけを空にして他の値は残す(hooks_dir, plugin_src):
    src = json.loads((plugin_src / "config.json").read_text(encoding="utf-8"))
    got = json.loads((hooks_dir.parent / "config.json").read_text(encoding="utf-8"))
    assert got == {**src, "ingest_url": "", "ingest_token": ""}


def test_Stopで送信を起動してもPOSTしない(
    hooks_dir, run_collect, tmp_path, ingest_receiver, hook_inputs
):
    state = tmp_path / "state"
    stop = next(hook_inputs("Stop"))
    res = run_collect("Stop", plugin_data=state, stdin=json.dumps(stop))
    assert res.returncode == 0
    # 送信の起動まで到達したこと。無いと「POST しない」が空振りで通る
    assert (state / "sent_at").exists()
    assert ingest_receiver.received(within=_WAIT_SEC) == 0
