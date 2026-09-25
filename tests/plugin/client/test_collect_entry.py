"""collect.py の main エントリ（無効化スイッチ・収集・送信条件）を subprocess として検証する。

`plugin/hooks` 一式を一時ディレクトリへコピーして起動する。実 `plugin/config.json` は
変更しない。送信条件の「起動する/しない」は、テスト用に立てた到達不能ポートへの POST が
`spool/` の退避を実際に引き起こすかどうかで観測する。
"""

import json
import time

import pytest


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
def test_disable_nonempty_value_skips_collection(run_collect, tmp_path, value):
    plugin_data = tmp_path / "plugin-data"
    result = run_collect(
        "Stop", plugin_data=plugin_data, env={"CC_GOVERNANCE_DISABLE": value}
    )
    assert result.returncode == 0
    assert not (plugin_data / "queue.jsonl").exists()


def test_disable_empty_value_collects(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    result = run_collect(
        "PostToolUse", plugin_data=plugin_data, env={"CC_GOVERNANCE_DISABLE": ""}
    )
    assert result.returncode == 0
    lines = (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1


def test_disable_unset_collects(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    result = run_collect("PostToolUse", plugin_data=plugin_data)
    assert result.returncode == 0
    lines = (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1


def test_disable_blocks_launch_even_if_send_condition_met(
    run_collect, tmp_path, write_config, unused_port
):
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    (plugin_data / "queue.jsonl").write_text('{"n": 1}\n', encoding="utf-8")
    write_config(ingest_url=f"http://127.0.0.1:{unused_port()}/ingest")

    result = run_collect(
        "Stop", plugin_data=plugin_data, env={"CC_GOVERNANCE_DISABLE": "1"}
    )

    assert result.returncode == 0
    time.sleep(0.3)
    assert not (plugin_data / "sent_at").exists()
    assert not _spool_has_file(plugin_data)
    assert (plugin_data / "queue.jsonl").exists()


# --- 収集 ---


def test_hook_event_field_matches_arg(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    result = run_collect("PostToolUse", plugin_data=plugin_data)
    assert result.returncode == 0
    row = json.loads(
        (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()[0]
    )
    assert row["hook_event"] == "PostToolUse"


def test_missing_argv_exits_zero(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    result = run_collect(plugin_data=plugin_data)
    assert result.returncode == 0
    assert result.stderr == ""


def test_two_runs_append_two_distinct_events(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    run_collect("PostToolUse", plugin_data=plugin_data)
    run_collect("PostToolUse", plugin_data=plugin_data)
    lines = (plugin_data / "queue.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    ids = {json.loads(line)["event_id"] for line in lines}
    assert len(ids) == 2


# --- 送信条件と起動 ---


def test_send_condition_false_stop_does_not_launch(
    run_collect, tmp_path, write_config, unused_port
):
    plugin_data = tmp_path / "plugin-data"
    sent_at = plugin_data / "sent_at"
    _touch_now(sent_at)
    before_mtime = sent_at.stat().st_mtime
    write_config(ingest_url=f"http://127.0.0.1:{unused_port()}/ingest")

    result = run_collect("Stop", plugin_data=plugin_data)

    assert result.returncode == 0
    time.sleep(0.3)
    assert not _spool_has_file(plugin_data)
    assert sent_at.stat().st_mtime == before_mtime


def test_send_condition_true_stop_launches_and_marks_sent(
    run_collect, tmp_path, write_config, unused_port
):
    plugin_data = tmp_path / "plugin-data"
    write_config(ingest_url=f"http://127.0.0.1:{unused_port()}/ingest")

    result = run_collect("Stop", plugin_data=plugin_data)

    assert result.returncode == 0
    sent_at = plugin_data / "sent_at"
    assert sent_at.exists()
    assert abs(time.time() - sent_at.stat().st_mtime) < 5
    assert _wait_until(lambda: _spool_has_file(plugin_data))


def test_send_condition_true_session_start_launches(
    run_collect, tmp_path, write_config, unused_port
):
    plugin_data = tmp_path / "plugin-data"
    write_config(ingest_url=f"http://127.0.0.1:{unused_port()}/ingest")

    result = run_collect("SessionStart", plugin_data=plugin_data)

    assert result.returncode == 0
    assert (plugin_data / "sent_at").exists()
    assert _wait_until(lambda: _spool_has_file(plugin_data))


@pytest.mark.parametrize("hook_event", ["PostToolUse", "PreCompact"])
def test_other_hook_events_never_launch(
    run_collect, tmp_path, write_config, unused_port, hook_event
):
    """送信条件が真でも、引数が PostToolUse / PreCompact -> 起動しない（起動は2 hook のみ）。"""
    plugin_data = tmp_path / "plugin-data"
    write_config(ingest_url=f"http://127.0.0.1:{unused_port()}/ingest")

    result = run_collect(hook_event, plugin_data=plugin_data)

    assert result.returncode == 0
    time.sleep(0.3)
    assert not (plugin_data / "sent_at").exists()
    assert not _spool_has_file(plugin_data)


def test_normal_input_produces_empty_stdout(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    result = run_collect(
        "PostToolUse", plugin_data=plugin_data, stdin=json.dumps({"session_id": "abc"})
    )
    assert result.returncode == 0
    assert result.stdout == ""
