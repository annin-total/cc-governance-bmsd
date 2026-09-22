"""collect.py が、故意に壊した入力・環境でも常に exit 0・標準出力/標準エラー空で終わることを検証する。

`plugin/hooks` 一式を一時ディレクトリへコピーして起動する。実 `plugin/config.json` は
変更しない。このテストは実装の都合で緩めない（設計書 §3.3・§9.1）。
"""

import json
import os
import shutil
import signal
import stat
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
    "flush_interval_sec": 600,
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


def _run(
    collect_path,
    plugin_data=None,
    home=None,
    hook_event=None,
    extra_args=(),
    stdin=None,
    stdin_bytes=None,
    close_stdin=False,
):
    """collect.py を subprocess として起動する。終了コード・標準出力・標準エラーを検査する側で使う。"""
    args = [sys.executable, str(collect_path)]
    if hook_event is not None:
        args.append(hook_event)
    args.extend(extra_args)

    env = os.environ.copy()
    env.pop("CC_GOVERNANCE_DISABLE", None)
    if plugin_data is not None:
        env["CLAUDE_PLUGIN_DATA"] = str(plugin_data)
    else:
        env.pop("CLAUDE_PLUGIN_DATA", None)
    if home is not None:
        env["HOME"] = str(home)

    if close_stdin:
        input_kwargs = {"stdin": subprocess.DEVNULL}
    elif stdin_bytes is not None:
        input_kwargs = {"input": stdin_bytes}
    else:
        input_kwargs = {"input": (stdin if stdin is not None else "{}"), "text": True}

    return subprocess.run(
        args, capture_output=True, env=env, timeout=15, check=False, **input_kwargs
    )


def _assert_clean_exit(result):
    """終了コード0・標準出力/標準エラーが空であることを確認する。"""
    assert result.returncode == 0
    assert result.stdout == b"" or result.stdout == ""
    assert result.stderr == b"" or result.stderr == ""


def _queue_line_count(plugin_data):
    """`queue.jsonl` の行数を返す（無ければ0）。R-44: 収集自体が成立したことの主張に使う。"""
    path = Path(plugin_data) / "queue.jsonl"
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line)


# --- 壊れた標準入力 ---


def test_empty_stdin(tree, tmp_path):
    """#1: 標準入力が空。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin="")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_stdin_not_json(tree, tmp_path):
    """#2: 標準入力が `not json`。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin="not json")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_stdin_json_array(tree, tmp_path):
    """#3: 標準入力が `[]`。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin="[]")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_stdin_json_null(tree, tmp_path):
    """#4: 標準入力が `null`。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin="null")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_stdin_truncated_json(tree, tmp_path):
    """#5: 標準入力が `{` で終わる途中の JSON。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin="{")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_stdin_invalid_utf8_bytes(tree, tmp_path):
    """#6: 標準入力が UTF-8 として不正なバイト列。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(
        tree,
        plugin_data=plugin_data,
        hook_event="Stop",
        stdin_bytes=b"\xff\xfe\xfd\x00broken",
    )
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_stdin_10mb_single_line(tree, tmp_path):
    """#7: 標準入力が 10MB の JSON 1 行。"""
    plugin_data = tmp_path / "plugin-data"
    huge = json.dumps({"session_id": "x" * (10 * 1024 * 1024)})
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin=huge)
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_stdin_closed(tree, tmp_path):
    """#8: 標準入力を閉じたまま起動。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", close_stdin=True)
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


# --- transcript_path の異常値 ---


def test_transcript_path_missing_file(tree, tmp_path):
    """#9: transcript_path が存在しないパス、引数 Stop。"""
    plugin_data = tmp_path / "plugin-data"
    stdin = json.dumps({"transcript_path": str(tmp_path / "no-such-file.jsonl")})
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin=stdin)
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_transcript_path_is_directory(tree, tmp_path):
    """#10: transcript_path がディレクトリ、引数 PreCompact。"""
    plugin_data = tmp_path / "plugin-data"
    a_dir = tmp_path / "a-directory"
    a_dir.mkdir()
    stdin = json.dumps({"transcript_path": str(a_dir)})
    result = _run(
        tree,
        plugin_data=plugin_data,
        hook_event="PreCompact",
        stdin=stdin,
    )
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_transcript_path_is_number(tree, tmp_path):
    """#11: transcript_path が数値。`open()` に float を渡すと TypeError になる経路を張る。"""
    plugin_data = tmp_path / "plugin-data"
    stdin = json.dumps({"transcript_path": 123.5})
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop", stdin=stdin)
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


# --- config.json の異常 ---


def test_corrupt_config_json(tree, tmp_path):
    """#12: config.json を壊した状態。"""
    plugin_data = tmp_path / "plugin-data"
    (tree.parent.parent / "config.json").write_text("{not valid json", encoding="utf-8")
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_missing_config_json(tree, tmp_path):
    """#13: config.json を削除した状態。"""
    plugin_data = tmp_path / "plugin-data"
    (tree.parent.parent / "config.json").unlink()
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


# --- 状態ディレクトリ・状態ファイルの異常 ---


def test_readonly_state_dir(tree, tmp_path):
    """#14: 状態ディレクトリを読み取り専用にした状態。"""
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    plugin_data.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        result = _run(tree, plugin_data=plugin_data, hook_event="Stop")
        _assert_clean_exit(result)
    finally:
        plugin_data.chmod(stat.S_IRWXU)


def test_queue_path_is_directory(tree, tmp_path):
    """#15: queue.jsonl をディレクトリに置き換えた状態。"""
    plugin_data = tmp_path / "plugin-data"
    (plugin_data / "queue.jsonl").mkdir(parents=True)
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop")
    _assert_clean_exit(result)


def test_corrupt_identity_json(tree, tmp_path):
    """#16: identity.json を壊した状態。"""
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    (plugin_data / "identity.json").write_text("{not valid json", encoding="utf-8")
    result = _run(tree, plugin_data=plugin_data, hook_event="Stop")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_plugin_data_and_home_both_missing(tree, tmp_path):
    """#17: CLAUDE_PLUGIN_DATA と HOME の両方を存在しないパスに設定した状態。"""
    plugin_data = tmp_path / "no-such-plugin-data"
    result = _run(
        tree,
        plugin_data=plugin_data,
        home=tmp_path / "no-such-home",
        hook_event="Stop",
    )
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


# --- 送信条件が真で送信先に到達できない ---


def test_ingest_url_unresolvable_host(tree, tmp_path):
    """#18: ingest_url を解決できないホストにした状態で送信条件を満たす。

    送信を起動する経路のため、検証後すぐに `queue.jsonl` が spool へ退避されうる
    （detach した送信プロセスが並行して `rotate()` する）。収集自体が成立したことの
    主張はここでは行わず、他の壊れた入力のケース（#1〜#13・#16・#17・#19・#20）で見る。
    """
    _write_config(tree, ingest_url="http://this-host-does-not-exist.invalid/ingest")
    result = _run(tree, plugin_data=tmp_path / "plugin-data", hook_event="Stop")
    _assert_clean_exit(result)


# --- 引数の異常 ---


def test_empty_string_arg(tree, tmp_path):
    """#19: 引数に空文字を渡す。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(tree, plugin_data=plugin_data, hook_event="")
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


def test_five_args(tree, tmp_path):
    """#20: 引数を5つ渡す。"""
    plugin_data = tmp_path / "plugin-data"
    result = _run(
        tree,
        plugin_data=plugin_data,
        hook_event="Stop",
        extra_args=["extra1", "extra2", "extra3", "extra4"],
    )
    _assert_clean_exit(result)
    assert _queue_line_count(plugin_data) == 1  # R-44: 収集自体は成立する


# --- SIGINT による中断（R-42） ---

# インタプリタの起動そのものにも一定の時間がかかり（本環境では実測 0.12〜0.14 秒程度）、
# 起動中に届いた SIGINT は Python 側で捕まえられない（設計書・レビュー指摘が明記する
# 既知の制約）。起動中の窓とこのテストが検査したい「collect.py 自身の実行中」の窓を
# 混同しないよう、起動時間よりも十分後ろの時点だけを狙う。50MB の標準入力を与えて
# collect.py 自身の処理時間を伸ばし、狙った時点が確実にその中に収まるようにする。
_SIGINT_DELAYS_SEC = (0.3, 0.6, 0.9, 1.2)


def test_sigint_during_execution_leaves_stderr_empty(tree, tmp_path):
    """#21: hook 実行中に SIGINT を送っても標準エラーが空であることを確認する。

    実行中の複数の時点で SIGINT を送る。標準出力・標準エラーは一時ファイルへ向け、
    `stdin` には大きめの入力を与えて処理時間を延ばし、狙った時点が起動処理より
    十分後ろになるようにする。終了コードはシグナルで殺される経路があるため検査しない
    （標準エラーが空であることのみを主張する）。
    """
    huge_stdin = json.dumps({"session_id": "x" * (50 * 1024 * 1024)}).encode("utf-8")

    for i, delay in enumerate(_SIGINT_DELAYS_SEC):
        stdin_path = tmp_path / f"sigint-{i}.stdin"
        stdout_path = tmp_path / f"sigint-{i}.stdout"
        stderr_path = tmp_path / f"sigint-{i}.stderr"
        stdin_path.write_bytes(huge_stdin)

        env = os.environ.copy()
        env.pop("CC_GOVERNANCE_DISABLE", None)
        env["CLAUDE_PLUGIN_DATA"] = str(tmp_path / f"sigint-{i}-plugin-data")

        with (
            open(stdin_path, "rb") as stdin_f,
            open(stdout_path, "wb") as stdout_f,
            open(stderr_path, "wb") as stderr_f,
        ):
            proc = subprocess.Popen(
                [sys.executable, str(tree), "Stop"],
                stdin=stdin_f,
                stdout=stdout_f,
                stderr=stderr_f,
                env=env,
            )
            time.sleep(delay)
            proc.send_signal(signal.SIGINT)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)

        stderr_bytes = stderr_path.read_bytes()
        assert stderr_bytes == b"", f"delay={delay}s: stderr={stderr_bytes!r}"
