"""session_start.py が、故意に壊した入出力・環境でも常に exit 0・標準エラー空で終わることを検証する。

`plugin/hooks` 一式を一時ディレクトリへコピーして起動する。実 `plugin/config.json` は
変更しない。標準出力に書く唯一の hook である session_start.py には、この検証が無いまま
BrokenPipeError による exit 120 の欠陥が入り込んでいた（設計書 §3.3。`test_collect_exit_code.py`
と同じ作法に揃える）。
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
    """終了コード0・標準エラーが空であることを確認する。"""
    assert rc == 0
    assert stderr == b"" or stderr == ""


# --- 標準出力のパイプが閉じている（I-1） ---


def test_stdout_pipe_reader_closed(hooks_dir, tmp_path):
    """#1: 標準出力のパイプの読み口を閉じた状態で起動する。実測: 修正前は rc=120。"""
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
    """#2: fd 1（標準出力）そのものを閉じた状態で起動する。"""
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
    """壊れた JSON・空・10MB の JSON 1 行。"""
    env = _base_env(tmp_path)
    result = _run(hooks_dir, env, make_stdin())
    _assert_clean_exit(result.returncode, result.stderr)


# --- 状態ディレクトリが書けない ---


def test_readonly_state_dir(hooks_dir, tmp_path):
    """#6: 状態ディレクトリ（`seen.json` / `queue.jsonl` の置き場所）を読み取り専用にした状態。"""
    plugin_data = tmp_path / "plugin-data"
    plugin_data.mkdir(parents=True)
    plugin_data.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        env = _base_env(tmp_path, plugin_data=plugin_data)
        result = _run(hooks_dir, env, '{"session_id":"s","source":"startup"}')
        _assert_clean_exit(result.returncode, result.stderr)
    finally:
        plugin_data.chmod(stat.S_IRWXU)
