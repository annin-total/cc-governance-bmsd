"""session_start.py が、故意に壊した入出力・環境でも常に exit 0・標準エラー空で終わることを検証する。

`plugin/hooks` 一式を一時ディレクトリへコピーして起動する。実 `plugin/config.json` は変更しない。
標準出力に書く唯一の hook なので、閉じたパイプへの書き出し（BrokenPipeError で exit 120）が起きうる。
"""

import json
import os
import stat
import subprocess
import sys

import pytest


def _base_env(tmp_path, plugin_data=None, config_dir=None):
    """`CC_GOVERNANCE_DISABLE` を外し、状態ディレクトリ・設定ディレクトリを隔離した環境変数を返す。"""
    env = os.environ.copy()
    env.pop("CC_GOVERNANCE_DISABLE", None)
    env["CLAUDE_PLUGIN_DATA"] = str(
        plugin_data if plugin_data is not None else tmp_path / "state"
    )
    env["CLAUDE_CONFIG_DIR"] = str(
        config_dir if config_dir is not None else tmp_path / "config"
    )
    return env


def _run(hooks_dir, env, stdin):
    """複製した session_start.py を SessionStart として起動する。"""
    return subprocess.run(
        [sys.executable, str(hooks_dir / "session_start.py"), "SessionStart"],
        input=stdin,
        text=True,
        capture_output=True,
        env=env,
        timeout=15,
        check=False,
    )


def _assert_clean_exit(rc, stderr):
    assert rc == 0
    assert stderr == b"" or stderr == ""


# --- 標準出力のパイプが閉じている ---


def test_stdout_pipe_reader_closed(hooks_dir, tmp_path):
    env = _base_env(tmp_path)
    r, w = os.pipe()
    os.close(r)
    perr_r, perr_w = os.pipe()
    try:
        p = subprocess.Popen(
            [sys.executable, str(hooks_dir / "session_start.py"), "SessionStart"],
            stdin=subprocess.PIPE,
            stdout=w,
            stderr=perr_w,
            env=env,
        )
        os.close(w)
        os.close(perr_w)
        w = perr_w = -1
        p.stdin.write(b'{"session_id":"s","source":"startup"}')
        p.stdin.close()
        rc = p.wait(timeout=15)
        err = os.read(perr_r, 65536)
    finally:
        if w != -1:
            os.close(w)
        if perr_w != -1:
            os.close(perr_w)
        os.close(perr_r)
    _assert_clean_exit(rc, err)


def test_stdout_fd_closed(hooks_dir, tmp_path):
    env = _base_env(tmp_path)
    result = subprocess.run(
        f'exec {sys.executable} "{hooks_dir}/session_start.py" SessionStart 1>&-',
        shell=True,
        input="{}",
        text=True,
        capture_output=True,
        env=env,
        timeout=15,
        check=False,
    )
    _assert_clean_exit(result.returncode, result.stderr)


# --- 壊れた標準入力 ---


_BROKEN_STDIN = {
    "broken_json": lambda: "{not json",
    "empty": lambda: "",
    "10mb_single_line": lambda: json.dumps(
        {"session_id": "x" * (10 * 1024 * 1024), "source": "startup"}
    ),
}


@pytest.mark.parametrize("make_stdin", _BROKEN_STDIN.values(), ids=_BROKEN_STDIN.keys())
def test_stdin(hooks_dir, tmp_path, make_stdin):
    env = _base_env(tmp_path)
    result = _run(hooks_dir, env, make_stdin())
    _assert_clean_exit(result.returncode, result.stderr)


def test_collect_step_failure_queues_error_row(hooks_dir, tmp_path):
    """深い入れ子の標準入力（RecursionError）で収集の段が失敗しても clean exit で、error 行が 1 つ積まれる。"""
    env = _base_env(tmp_path)
    result = _run(hooks_dir, env, "[" * 100_000)
    _assert_clean_exit(result.returncode, result.stderr)
    lines = (tmp_path / "state" / "queue.jsonl").read_text(encoding="utf-8")
    errors = [
        (r["stage"], r["error_type"], r["hook_event"])
        for r in map(json.loads, lines.splitlines())
        if r["kind"] == "error"
    ]
    assert errors == [("collect", "RecursionError", "SessionStart")]


# --- 状態ディレクトリが書けない ---


def test_readonly_state_dir(hooks_dir, tmp_path):
    """状態ディレクトリ（`seen.json` / `queue.jsonl` の置き場所）を読み取り専用にした状態。"""
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    plugin_data.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        env = _base_env(tmp_path, plugin_data=plugin_data)
        result = _run(hooks_dir, env, '{"session_id":"s","source":"startup"}')
        _assert_clean_exit(result.returncode, result.stderr)
    finally:
        plugin_data.chmod(stat.S_IRWXU)
