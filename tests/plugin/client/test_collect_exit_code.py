"""collect.py が、故意に壊した入力・環境でも常に exit 0・標準出力/標準エラー空で終わることを検証する。

`plugin/hooks` 一式を一時ディレクトリへコピーして起動する。実 `plugin/config.json` は
変更しない。このテストは実装の都合で緩めない。
"""

import json
import os
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path

import pytest


def _assert_clean_exit(result):
    assert result.returncode == 0
    assert result.stdout == b"" or result.stdout == ""
    assert result.stderr == b"" or result.stderr == ""


def _queue_line_count(plugin_data):
    """`queue.jsonl` の行数を返す（無ければ0）。収集自体が成立したことの主張に使う。"""
    path = Path(plugin_data) / "queue.jsonl"
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line)


def _transcript_dir(tmp_path, _hooks_dir):
    a_dir = tmp_path / "a-directory"
    a_dir.mkdir()
    return ("PreCompact",), {"stdin": json.dumps({"transcript_path": str(a_dir)})}


def _corrupt_config(_tmp_path, hooks_dir):
    (hooks_dir.parent / "config.json").write_text("{not valid json", encoding="utf-8")
    return ("Stop",), {}


def _missing_config(_tmp_path, hooks_dir):
    (hooks_dir.parent / "config.json").unlink()
    return ("Stop",), {}


def _corrupt_identity(tmp_path, _hooks_dir):
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    (plugin_data / "identity.json").write_text("{not valid json", encoding="utf-8")
    return ("Stop",), {}


# 各ケースは (tmp_path, hooks_dir) を受け取り、collect.py の (引数, run_collect の追加引数) を返す。
# 追加引数に plugin_data が無ければ tmp_path / "plugin-data" を使う。
_COLLECTING_CASES = {
    # 壊れた標準入力
    "empty_stdin": lambda t, h: (("Stop",), {"stdin": ""}),
    "stdin_not_json": lambda t, h: (("Stop",), {"stdin": "not json"}),
    "stdin_json_array": lambda t, h: (("Stop",), {"stdin": "[]"}),
    "stdin_json_null": lambda t, h: (("Stop",), {"stdin": "null"}),
    "stdin_truncated_json": lambda t, h: (("Stop",), {"stdin": "{"}),
    "stdin_invalid_utf8_bytes": lambda t, h: (
        ("Stop",),
        {"stdin_bytes": b"\xff\xfe\xfd\x00broken"},
    ),
    "stdin_10mb_single_line": lambda t, h: (
        ("Stop",),
        {"stdin": json.dumps({"session_id": "x" * (10 * 1024 * 1024)})},
    ),
    "stdin_closed": lambda t, h: (("Stop",), {"close_stdin": True}),
    # transcript_path の異常値（数値は open() に float を渡して TypeError になる経路）
    "transcript_path_missing_file": lambda t, h: (
        ("Stop",),
        {"stdin": json.dumps({"transcript_path": str(t / "no-such-file.jsonl")})},
    ),
    "transcript_path_is_directory": _transcript_dir,
    "transcript_path_is_number": lambda t, h: (
        ("Stop",),
        {"stdin": json.dumps({"transcript_path": 123.5})},
    ),
    # config.json・状態ファイル・環境変数の異常
    "corrupt_config_json": _corrupt_config,
    "missing_config_json": _missing_config,
    "corrupt_identity_json": _corrupt_identity,
    "plugin_data_and_home_both_missing": lambda t, h: (
        ("Stop",),
        {
            "plugin_data": t / "no-such-plugin-data",
            "env": {"HOME": str(t / "no-such-home")},
        },
    ),
    # 引数の異常
    "empty_string_arg": lambda t, h: (("",), {}),
    "five_args": lambda t, h: (("Stop", "extra1", "extra2", "extra3", "extra4"), {}),
}


@pytest.mark.parametrize(
    "setup", _COLLECTING_CASES.values(), ids=_COLLECTING_CASES.keys()
)
def test_broken_input_still_collects(setup, run_collect, hooks_dir, tmp_path):
    """壊れた入力・環境でも clean exit で終わり、収集自体は成立する（queue に 1 行）。"""
    argv, kwargs = setup(tmp_path, hooks_dir)
    kwargs.setdefault("plugin_data", tmp_path / "plugin-data")
    result = run_collect(*argv, **kwargs)
    _assert_clean_exit(result)
    assert _queue_line_count(kwargs["plugin_data"]) == 1


# --- 状態ディレクトリ・状態ファイルの異常 ---


def test_readonly_state_dir(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    plugin_data.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        result = run_collect("Stop", plugin_data=plugin_data)
        _assert_clean_exit(result)
    finally:
        plugin_data.chmod(stat.S_IRWXU)


def test_queue_path_is_directory(run_collect, tmp_path):
    plugin_data = tmp_path / "plugin-data"
    (plugin_data / "queue.jsonl").mkdir(parents=True)
    result = run_collect("Stop", plugin_data=plugin_data)
    _assert_clean_exit(result)


# --- 送信条件が真で送信先に到達できない ---


def test_ingest_url_unresolvable_host(run_collect, tmp_path, write_config):
    """ingest_url を解決できないホストにした状態で送信条件を満たす。

    送信を起動する経路のため、検証後すぐに `queue.jsonl` が spool へ退避されうる
    （detach した送信プロセスが並行して `rotate()` する）。収集自体が成立したことの
    主張はここでは行わず、`test_broken_input_still_collects` で見る。
    """
    write_config(ingest_url="http://this-host-does-not-exist.invalid/ingest")
    result = run_collect("Stop", plugin_data=tmp_path / "plugin-data")
    _assert_clean_exit(result)


# --- 処理の途中で想定外の例外が起きる ---


def test_unexpected_exception_is_swallowed(run_collect, tmp_path):
    """処理の途中で想定外の例外が起きても clean exit で終わる（最外周の例外処理の検査）。

    再帰上限を超える入れ子の JSON は `RecursionError`（ValueError 派生ではない）を投げ、
    標準入力の読み取りで捕まえられずに最外周まで届く。標準入力は環境の側から与えられるので、
    内部の関数名に依存せず想定外の失敗を起こせる。途中で捕まえるよう実装が変わっても
    このテストは通るが、その場合は最外周の例外処理の検査ではなくなる。
    """
    result = run_collect(
        "Stop", plugin_data=tmp_path / "plugin-data", stdin="[" * 100_000
    )
    _assert_clean_exit(result)


# --- SIGINT による中断 ---

# インタプリタの起動そのものにも時間がかかり、起動中に届いた SIGINT は Python 側で
# 捕まえられない（既知の制約）。起動中の窓とこのテストが検査したい「collect.py 自身の実行中」の窓を
# 混同しないよう、起動時間よりも十分後ろの時点だけを狙う。50MB の標準入力を与えて
# collect.py 自身の処理時間を伸ばし、狙った時点が確実にその中に収まるようにする。
_SIGINT_DELAYS_SEC = (0.3, 0.6, 0.9, 1.2)


def test_sigint_during_execution_leaves_stderr_empty(hooks_dir, tmp_path):
    """hook 実行中に SIGINT を送っても標準エラーが空であることを確認する。

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
                [sys.executable, str(hooks_dir / "collect.py"), "Stop"],
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
