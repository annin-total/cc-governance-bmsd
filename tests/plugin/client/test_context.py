"""_context.py の transcript 末尾からの取得（context_tokens と Claude Code の版）のテスト。"""

import json
import os
import stat
import subprocess
import sys
import time
from pathlib import Path

import pytest
from _context import claude_code_version, context_tokens

_HOOKS_DIR = Path(__file__).resolve().parents[3] / "plugin" / "hooks"


def _write_jsonl(path, lines):
    """1 行ずつ文字列/バイト列を書き込む。"""
    with open(path, "wb") as f:
        for line in lines:
            if isinstance(line, str):
                line = line.encode("utf-8")
            f.write(line + b"\n")


def _usage_line(**usage):
    """message.usage を持つ 1 行分の JSON 文字列を作る。"""
    return json.dumps({"message": {"usage": usage}})


def test_sums_three_usage_fields(tmp_path):
    """input_tokens 100 / cache_creation 20 / cache_read 3 → 123。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(
        path,
        [
            _usage_line(
                input_tokens=100,
                cache_creation_input_tokens=20,
                cache_read_input_tokens=3,
            )
        ],
    )
    assert context_tokens(str(path)) == 123


def test_picks_line_nearest_to_tail(tmp_path):
    """usage 行が 2 つ。末尾に近い方（合計 5）を採る。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(
        path,
        [
            _usage_line(input_tokens=999),
            _usage_line(input_tokens=5),
        ],
    )
    assert context_tokens(str(path)) == 5


def test_missing_fields_default_to_zero(tmp_path):
    """usage に input_tokens 100 のみ → 100。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [_usage_line(input_tokens=100)])
    assert context_tokens(str(path)) == 100


def test_empty_usage_falls_back_to_none(tmp_path):
    """usage が {} → 後続を探し、見つからなければ None。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [json.dumps({"message": {"usage": {}}})])
    assert context_tokens(str(path)) is None


def test_null_usage_falls_back_to_earlier_line(tmp_path):
    """message はあるが usage が null → 更に前の行を探す。無ければ None。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [json.dumps({"message": {"usage": None}})])
    assert context_tokens(str(path)) is None


def test_no_message_lines_return_none(tmp_path):
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [json.dumps({"other": i}) for i in range(100)])
    assert context_tokens(str(path)) is None


def test_missing_path_returns_none(tmp_path):
    assert context_tokens(str(tmp_path / "no-such-file.jsonl")) is None


def test_none_path_returns_none():
    assert context_tokens(None) is None


def test_empty_path_returns_none():
    assert context_tokens("") is None


def test_zero_byte_file_returns_none(tmp_path):
    path = tmp_path / "empty.jsonl"
    path.write_bytes(b"")
    assert context_tokens(str(path)) is None


def test_directory_path_returns_none(tmp_path):
    assert context_tokens(str(tmp_path)) is None


def test_unreadable_file_returns_none(tmp_path):
    path = tmp_path / "secret.jsonl"
    _write_jsonl(path, [_usage_line(input_tokens=1)])
    os.chmod(path, 0)
    try:
        if os.access(path, os.R_OK):
            pytest.skip("root 権限などで読み取り制限が効かない環境")
        assert context_tokens(str(path)) is None
    finally:
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)


def test_usage_outside_tail_window_returns_none(tmp_path):
    """末尾 256KB の外にだけ usage がある → None。"""
    path = tmp_path / "t.jsonl"
    filler = "x" * 1000
    lines = [_usage_line(input_tokens=42)]
    lines += [json.dumps({"filler": filler}) for _ in range(300)]
    _write_jsonl(path, lines)
    assert context_tokens(str(path)) is None


def test_broken_json_lines_after_usage_are_skipped(tmp_path):
    """usage 行の後ろに壊れた JSON 行が 3 行混ざる → usage の合計値。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(
        path,
        [
            _usage_line(input_tokens=10),
            "{not valid json",
            "]]] broken [[[",
            "{",
        ],
    )
    assert context_tokens(str(path)) == 10


def test_truncated_first_line_at_tail_boundary_is_skipped(tmp_path):
    """末尾 tail バイトの境界で先頭行が途中から切れても、切れた行を飛ばして後ろの usage を採る。"""
    path = tmp_path / "t.jsonl"
    tail = 4096
    good = _usage_line(input_tokens=7).encode("utf-8")
    padding_needed = tail - len(good) - 1
    # 先頭行を「途中で切れる」ように、tail の外側から始まる長い1行を作る
    long_line = b"{" + b"a" * (padding_needed + 500)
    with open(path, "wb") as f:
        f.write(long_line + b"\n")
        f.write(good + b"\n")
    assert context_tokens(str(path), tail=tail) == 7


def test_blank_lines_are_skipped(tmp_path):
    path = tmp_path / "t.jsonl"
    lines = [""] * 20 + [_usage_line(input_tokens=8)] + [""] * 20
    _write_jsonl(path, lines)
    assert context_tokens(str(path)) == 8


def test_usage_value_as_string_returns_none(tmp_path):
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [json.dumps({"message": {"usage": {"input_tokens": "100"}}})])
    assert context_tokens(str(path)) is None


def test_usage_as_list_returns_none(tmp_path):
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [json.dumps({"message": {"usage": [1, 2, 3]}})])
    assert context_tokens(str(path)) is None


def test_non_json_text_returns_none(tmp_path):
    path = tmp_path / "t.txt"
    path.write_text("not json at all. " * 60000, encoding="utf-8")
    assert context_tokens(str(path)) is None


def test_large_file_is_fast(tmp_path):
    """16MB のファイル。末尾に usage（合計 7）→ 7。実行時間は 1 秒未満。"""
    path = tmp_path / "big.jsonl"
    filler_line = json.dumps({"filler": "x" * 998})
    with open(path, "wb") as f:
        line_bytes = filler_line.encode("utf-8") + b"\n"
        target = 16 * 1024 * 1024
        written = 0
        while written < target:
            f.write(line_bytes)
            written += len(line_bytes)
        f.write(_usage_line(input_tokens=7).encode("utf-8") + b"\n")

    start = time.monotonic()
    result = context_tokens(str(path))
    elapsed = time.monotonic() - start
    assert result == 7
    assert elapsed < 1.0


def test_invalid_utf8_bytes_do_not_raise(tmp_path):
    """UTF-8 として不正なバイト列を含む行 → 例外なし。戻り値は None か数値。"""
    path = tmp_path / "t.jsonl"
    with open(path, "wb") as f:
        f.write(b"\xff\xfe not valid utf-8 \x80\x81\n")
        f.write(_usage_line(input_tokens=9).encode("utf-8") + b"\n")
    result = context_tokens(str(path))
    assert result is None or isinstance(result, int)


def test_all_zero_usage_falls_back_to_earlier_nonzero(tmp_path):
    """末尾が全値 0 の usage、その前に合計 5 の usage → 5（0 の行を採らず遡る）。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(
        path,
        [
            _usage_line(input_tokens=5),
            _usage_line(
                input_tokens=0, cache_creation_input_tokens=0, cache_read_input_tokens=0
            ),
        ],
    )
    assert context_tokens(str(path)) == 5


def test_only_zero_usage_returns_none(tmp_path):
    """3 値すべてが 0 の usage 行しか無い → None（0 を真値として返さない）。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(
        path,
        [
            _usage_line(
                input_tokens=0, cache_creation_input_tokens=0, cache_read_input_tokens=0
            )
        ],
    )
    assert context_tokens(str(path)) is None


def _run_context_tokens_in_subprocess(path_literal: str) -> subprocess.CompletedProcess:
    """別プロセスで context_tokens(path) を呼ぶ。

    `bool` の `path`（例: True）は `open()` に渡ると fd 1（標準出力）として
    解釈され、`with` を抜けるときに実プロセスの標準出力を閉じてしまう。
    この検査自体がテストランナーの標準出力を壊さないよう、サブプロセスに隔離する。
    """
    code = (
        f"import sys; sys.path.insert(0, {str(_HOOKS_DIR)!r});"
        "from _context import context_tokens;"
        f"r = context_tokens({path_literal});"
        "print(r);"  # fd 1 が閉じられていれば、この print 自体が失敗の引き金になる
        "sys.exit(0 if (r is None or isinstance(r, int)) else 1)"
    )
    return subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        timeout=10,
        text=True,
        check=False,
    )


@pytest.mark.parametrize("path_literal", ["1.5", "True", "999999", "None", "''"])
def test_non_str_transcript_path_does_not_raise_or_corrupt_stdout(path_literal):
    """float / bool / int / None / 空文字の transcript_path でも例外を漏らさず、
    終了コードは常に 0（`None` か数値を返す）。`True` は fd として解釈されると
    標準出力を閉じ、終了コードが 120 になる経路を検査する。
    """
    proc = _run_context_tokens_in_subprocess(path_literal)
    assert proc.returncode == 0, (
        f"path={path_literal}: exit={proc.returncode} stderr={proc.stderr!r}"
    )


def _version_line(version, **extra):
    """`version` を持つ transcript の 1 行分の JSON 文字列を作る。"""
    return json.dumps({"type": "user", "version": version, **extra})


def test_version_picks_line_nearest_to_tail(tmp_path):
    """`version` を持つ行が 2 つ。末尾に近い方を採る。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [_version_line("2.1.281"), _version_line("2.1.283")])
    assert claude_code_version(str(path)) == "2.1.283"


def test_version_skips_lines_without_string_version(tmp_path):
    """末尾側の `version` 欠落・非文字列・壊れた行を飛ばして、文字列の `version` を採る。"""
    path = tmp_path / "t.jsonl"
    _write_jsonl(
        path,
        [
            _version_line("2.1.283"),
            json.dumps({"type": "queue-operation"}),
            _version_line(2),
            _version_line(None),
            "{broken",
            json.dumps(["version"]),
        ],
    )
    assert claude_code_version(str(path)) == "2.1.283"


def test_version_absent_returns_none(tmp_path):
    path = tmp_path / "t.jsonl"
    _write_jsonl(path, [_usage_line(input_tokens=1)])
    assert claude_code_version(str(path)) is None


@pytest.mark.parametrize("path", [None, "", 1.5, True])
def test_version_unusable_path_returns_none(path):
    assert claude_code_version(path) is None


def test_version_missing_file_returns_none(tmp_path):
    assert claude_code_version(str(tmp_path / "no-such-file.jsonl")) is None


def test_version_outside_tail_window_returns_none(tmp_path):
    """末尾 `tail` バイトの外にだけ `version` がある → None。"""
    path = tmp_path / "t.jsonl"
    lines = [_version_line("2.1.283")] + [json.dumps({"f": "x" * 100})] * 50
    _write_jsonl(path, lines)
    assert claude_code_version(str(path), tail=1024) is None


def test_deeply_nested_line_is_skipped(tmp_path):
    """末尾の行が再帰上限を超える入れ子でも、その行を飛ばして手前の行から両方を採る。

    `RecursionError` は ValueError 派生ではない。捕まえ損ねると Stop の行ごと失われる。
    """
    depth = sys.getrecursionlimit() * 10
    path = tmp_path / "t.jsonl"
    _write_jsonl(
        path,
        [
            json.dumps(
                {"version": "2.1.283", "message": {"usage": {"input_tokens": 7}}}
            ),
            ('{"a":' * depth) + "1" + ("}" * depth),
        ],
    )
    assert context_tokens(str(path)) == 7
    assert claude_code_version(str(path)) == "2.1.283"
