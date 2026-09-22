"""1 つの異常が収集全体を無言で止めないことを検証する。

ここで守るのは「rc=0 で終わる」ことではなく、**rc=0 で終わったうえでキューに行が残る**ことである。
rc=0 だけを見ると、何も収集しないまま成功したように見える故障を取り逃す。
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_HOOKS_SRC = _REPO_ROOT / "plugin" / "hooks"
_CONFIG_SRC = _REPO_ROOT / "plugin" / "config.json"
_HOOKS_JSON = _HOOKS_SRC / "hooks.json"


@pytest.fixture
def tree(tmp_path):
    """`plugin/hooks` 一式を一時ディレクトリへ複製し、collect.py のパスを返す。"""
    hooks_dst = tmp_path / "plugin" / "hooks"
    shutil.copytree(_HOOKS_SRC, hooks_dst, ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(_CONFIG_SRC, tmp_path / "plugin" / "config.json")
    return hooks_dst / "collect.py"


def _run(collect_py, state_dir, extra_env=None):
    """collect.py を Stop として起動し、(rc, stderr, キューの行) を返す。"""
    env = dict(os.environ)
    env["CLAUDE_PLUGIN_DATA"] = str(state_dir)
    env["HOME"] = str(state_dir)
    env.pop("CC_GOVERNANCE_DISABLE", None)
    env.update(extra_env or {})
    proc = subprocess.run(
        [sys.executable, str(collect_py), "Stop"],
        input=json.dumps({"session_id": "s"}),
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
        check=False,
    )
    queue = Path(state_dir) / "queue.jsonl"
    lines = queue.read_text(encoding="utf-8").splitlines() if queue.exists() else []
    return proc.returncode, proc.stderr, [json.loads(line) for line in lines]


def test_契約に列が増えても収集が止まらない(tree, tmp_path):
    """`EXTRA_COLUMNS` に列が増えたとき、その列を None で埋めて収集を続ける。

    旧実装は `raw_extra[name]` で引いており、`KeyError` が `except BaseException` に
    飲まれて rc=0 のままキューに 1 行も積まれなくなっていた（裁定 R-33）。
    """
    contract = tree.parent / "contract.py"
    text = contract.read_text(encoding="utf-8")
    contract.write_text(
        text.replace(
            "EXTRA_COLUMNS = (",
            'EXTRA_COLUMNS = (\n    ("zz_new_col", "VARCHAR(32)"),',
            1,
        ),
        encoding="utf-8",
    )

    rc, stderr, rows = _run(tree, tmp_path / "state")

    assert rc == 0
    assert stderr == ""
    assert len(rows) == 1
    assert rows[0]["zz_new_col"] is None
    assert rows[0]["hook_event"] == "Stop"


def test_git_が非UTF8を返しても収集が止まらない(tree, tmp_path):
    """`git config user.email` が非 UTF-8 を返しても、`user_email` を None にして収集を続ける。

    `text=True` の strict デコードが投げる `UnicodeDecodeError` は `ValueError` 派生であり、
    `except (OSError, SubprocessError)` では捕まらない。旧実装ではこれが収集全体を無言で
    止め、状態ディレクトリすら作られなかった。
    """
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    git = fake_bin / "git"
    git.write_bytes(b"#!/bin/sh\nprintf 'a\\377b@example.com'\n")
    git.chmod(0o755)

    env = {"PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}"}
    env.pop("CC_GOVERNANCE_USER_EMAIL", None)
    rc, stderr, rows = _run(
        tree, tmp_path / "state", {**env, "CC_GOVERNANCE_USER_EMAIL": ""}
    )

    assert rc == 0
    assert stderr == ""
    assert len(rows) == 1
    assert rows[0]["user_email"] is None
    assert rows[0]["host"]


def test_import_しただけでは呼び出し元のSIGINTを殺さない():
    """`import collect` が呼び出し元プロセスの SIGINT ディスポジションを変えない。

    R-42 の `SIG_IGN` はスクリプトとして起動されたときだけ立てる。モジュールとして
    import した pytest 等の Ctrl-C まで殺すと、収集とは無関係の場所に実害が出る。
    """
    code = (
        "import sys, signal;"
        f"sys.path.insert(0, {str(_HOOKS_SRC)!r});"
        "before = signal.getsignal(signal.SIGINT);"
        "import collect;"
        "print(before is signal.getsignal(signal.SIGINT))"
    )
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert proc.stdout.strip() == "True"


def test_git_のtimeoutがhookのtimeoutより短い():
    """git 単体の timeout が `hooks.json` の hook 全体の timeout より短い。

    同値だと、git が固まったときに hook ごと打ち切られ、キューに 1 行も残らない。
    """
    sys.path.insert(0, str(_HOOKS_SRC))
    import _identity

    hook_timeouts = {
        entry["timeout"]
        for blocks in json.loads(_HOOKS_JSON.read_text(encoding="utf-8"))[
            "hooks"
        ].values()
        for block in blocks
        for entry in block["hooks"]
    }
    assert _identity._GIT_TIMEOUT_SEC < min(hook_timeouts)
