"""collect.py の main エントリ（無効化スイッチ・収集・送信条件）を subprocess として検証する。

`plugin/hooks` 一式を一時ディレクトリへコピーして起動する。実 `plugin/config.json` は
変更しない。送信条件の「起動する/しない」は、テスト用に立てた到達不能ポートへの POST が
`spool/` の退避を実際に引き起こすかどうかで観測する。
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_HOOKS_SRC = _REPO_ROOT / "plugin" / "hooks"
_CONFIG_SRC = _REPO_ROOT / "plugin" / "config.json"

_DEFAULT_CONFIG = {
    "ingest_url": "",
    "ingest_token": "",
    "timeout_sec": 5,
    "spool_max_bytes": 5242880,
    "spool_max_days": 7,
}


@pytest.fixture
def tree(tmp_path):
    """`plugin/hooks` と `config.json` を一時ディレクトリへコピーし、collect.py のパスを返す。"""
    hooks_dst = tmp_path / "plugin" / "hooks"
    shutil.copytree(_HOOKS_SRC, hooks_dst, ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(_CONFIG_SRC, tmp_path / "plugin" / "config.json")
    return hooks_dst / "collect.py"


def _write_config(tree_path, **overrides):
    """コピー先の `config.json` を書き換える。"""
    config = dict(_DEFAULT_CONFIG)
    config.update(overrides)
    path = tree_path.parent.parent / "config.json"
    path.write_text(json.dumps(config), encoding="utf-8")


def _free_port() -> int:
    """接続できないポートを1つ確保する（bind 直後に close する）。"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def _run(collect_path, plugin_data, hook_event=None, stdin_text="{}", disable=None):
    """collect.py を subprocess として起動する。"""
    args = [sys.executable, str(collect_path)]
    if hook_event is not None:
        args.append(hook_event)
    env = os.environ.copy()
    env.pop("CC_GOVERNANCE_DISABLE", None)
    env["CLAUDE_PLUGIN_DATA"] = str(plugin_data)
    if disable is not None:
        env["CC_GOVERNANCE_DISABLE"] = disable
    return subprocess.run(
        args,
        input=stdin_text,
        capture_output=True,
        text=True,
        env=env,
        timeout=10,
        check=False,
    )


def _wait_until(predicate, timeout=3.0, interval=0.05) -> bool:
    """`predicate` が真になるまで待つ。タイムアウトしたら最後の評価値を返す。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def _touch_now(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()


def _spool_has_file(plugin_data) -> bool:
    spool_dir = plugin_data / "spool"
    return spool_dir.is_dir() and any(spool_dir.iterdir())


# --- 無効化スイッチ ---


@pytest.mark.parametrize("value", ["1", "0", "false"])
def test_disable_nonempty_value_skips_collection(tree, tmp_path, value):
    """#1-3: CC_GOVERNANCE_DISABLE が空でない値 -> exit 0。queue.jsonl を作らない。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data, hook_event="Stop", disable=value)
    assert result.returncode == 0
    assert not (plugin_data / "queue.jsonl").exists()


def test_disable_empty_value_collects(tree, tmp_path):
    """#4: CC_GOVERNANCE_DISABLE が空文字 -> 収集する。queue.jsonl が1行。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data, hook_event="PostToolUse", disable="")
    assert result.returncode == 0
    lines = (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1


def test_disable_unset_collects(tree, tmp_path):
    """#5: CC_GOVERNANCE_DISABLE 未設定 -> 収集する。queue.jsonl が1行。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data, hook_event="PostToolUse")
    assert result.returncode == 0
    lines = (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1


def test_disable_blocks_launch_even_if_send_condition_met(tree, tmp_path):
    """#6: 無効化スイッチが立っている状態で送信条件を満たしても、送信プロセスを起動しない。"""
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    (plugin_data / "queue.jsonl").write_text('{"n": 1}\n', encoding="utf-8")
    _write_config(tree, ingest_url=f"http://127.0.0.1:{_free_port()}/ingest")

    result = _run(tree, plugin_data, hook_event="Stop", disable="1")

    assert result.returncode == 0
    time.sleep(0.3)
    assert not (plugin_data / "sent_at").exists()
    assert not _spool_has_file(plugin_data)
    assert (plugin_data / "queue.jsonl").exists()


# --- 収集 ---


def test_hook_event_field_matches_arg(tree, tmp_path):
    """#7: 引数に PostToolUse を渡す -> 行の hook_event = "PostToolUse"。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data, hook_event="PostToolUse")
    assert result.returncode == 0
    row = json.loads(
        (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()[0]
    )
    assert row["hook_event"] == "PostToolUse"


def test_missing_argv_exits_zero(tree, tmp_path):
    """#8: 引数を渡さない -> exit 0。例外を出さない（標準エラーが空）。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data, hook_event=None)
    assert result.returncode == 0
    assert result.stderr == ""


def test_two_runs_append_two_distinct_events(tree, tmp_path):
    """#9: 2回続けて実行 -> queue.jsonl が2行。event_id が相異なる。"""
    plugin_data = tmp_path / "plugin-data"
    _run(tree, plugin_data, hook_event="PostToolUse")
    _run(tree, plugin_data, hook_event="PostToolUse")
    lines = (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    ids = {json.loads(line)["event_id"] for line in lines}
    assert len(ids) == 2


# --- 送信条件と起動 ---


def test_send_condition_false_stop_does_not_launch(tree, tmp_path):
    """#10: 送信条件が偽、引数 Stop -> 送信プロセスを起動しない。"""
    plugin_data = tmp_path / "plugin-data"
    sent_at = plugin_data / "sent_at"
    _touch_now(sent_at)
    before_mtime = sent_at.stat().st_mtime
    _write_config(tree, ingest_url=f"http://127.0.0.1:{_free_port()}/ingest")

    result = _run(tree, plugin_data, hook_event="Stop")

    assert result.returncode == 0
    time.sleep(0.3)
    assert not _spool_has_file(plugin_data)
    assert sent_at.stat().st_mtime == before_mtime


def test_send_condition_true_stop_launches_and_marks_sent(tree, tmp_path):
    """#11: 送信条件が真、引数 Stop -> 送信プロセスを起動する。sent_at の mtime が更新される。"""
    plugin_data = tmp_path / "plugin-data"
    _write_config(tree, ingest_url=f"http://127.0.0.1:{_free_port()}/ingest")

    result = _run(tree, plugin_data, hook_event="Stop")

    assert result.returncode == 0
    sent_at = plugin_data / "sent_at"
    assert sent_at.exists()
    assert abs(time.time() - sent_at.stat().st_mtime) < 5
    assert _wait_until(lambda: _spool_has_file(plugin_data))


def test_send_condition_true_session_start_launches(tree, tmp_path):
    """#12: 送信条件が真、引数 SessionStart -> 送信プロセスを起動する。"""
    plugin_data = tmp_path / "plugin-data"
    _write_config(tree, ingest_url=f"http://127.0.0.1:{_free_port()}/ingest")

    result = _run(tree, plugin_data, hook_event="SessionStart")

    assert result.returncode == 0
    assert (plugin_data / "sent_at").exists()
    assert _wait_until(lambda: _spool_has_file(plugin_data))


@pytest.mark.parametrize("hook_event", ["PostToolUse", "PreCompact"])
def test_other_hook_events_never_launch(tree, tmp_path, hook_event):
    """#13-14: 送信条件が真でも、引数が PostToolUse / PreCompact -> 起動しない（起動は2 hook のみ）。"""
    plugin_data = tmp_path / "plugin-data"
    _write_config(tree, ingest_url=f"http://127.0.0.1:{_free_port()}/ingest")

    result = _run(tree, plugin_data, hook_event=hook_event)

    assert result.returncode == 0
    time.sleep(0.3)
    assert not (plugin_data / "sent_at").exists()
    assert not _spool_has_file(plugin_data)


def test_normal_input_produces_empty_stdout(tree, tmp_path):
    """#15: 正常な入力 -> 標準出力が空。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(
        tree,
        plugin_data,
        hook_event="PostToolUse",
        stdin_text=json.dumps({"session_id": "abc"}),
    )
    assert result.returncode == 0
    assert result.stdout == ""
