"""モジュール 6（非漏洩）: プロンプトとツール入出力に仕込んだ SENTINEL が、送信まで通してもどこにも残らない。

要認証。走査するのは queue/spool（= 送信する生バイト）・サーバの DB ファイル・隔離ルート全体・本物の config。
隔離ルートの `config/projects/` は除く。Claude Code 本体の transcript であり、SENTINEL が在るのが正しい
（在ることを、SENTINEL が本当に届いた証拠として先に確かめる）。
"""

import json
import os
import uuid
from pathlib import Path

import pytest
from _flow import ask, data_dir, ingest_config, install, session
from _market import PLUGIN_SRC, version
from _root import REAL_CONFIG_DIRS, hook_rows

_PROMPTS = Path(__file__).resolve().parent / "samples" / "prompts.json"
_CONTRACT = "hooks/contract.py"
# 陽性対照で契約に足す、自由文を指すキーパス
_LEAKY_FIELDS = (
    '    ("leak_prompt", ("prompt",), "VARCHAR(255)"),\n'
    '    ("leak_command", ("tool_input", "command"), "VARCHAR(255)"),\n'
)


def _hits(top: Path, needle: str) -> list:
    """`top` 配下で `needle` をバイト列として含む通常ファイル（シンボリックリンクはたどらない）。"""
    found = []
    for d, _, files in os.walk(top):
        for name in files:
            p = Path(d, name)
            if p.is_symlink() or not p.is_file():
                continue
            # 本物の config は並行する Claude Code が書き換える（走査中に消えうる）
            try:
                if needle.encode() in p.read_bytes():
                    found.append(p)
            except FileNotFoundError:
                continue
    return found


def _leaks(root, needle: str) -> list:
    """隔離ルートのうち、Claude Code 本体の transcript 以外で `needle` を含むもの。"""
    projects = root.config / "projects"
    return [p for p in _hits(root.path, needle) if projects not in p.parents]


def _leak_session(root) -> str:
    """SENTINEL をプロンプトに入れ、Bash で echo させる。transcript に届いたことまで確かめる。"""
    spec = json.loads(_PROMPTS.read_text(encoding="utf-8"))["leak"]
    sentinel = f"SENTINEL-{uuid.uuid4().hex}"
    prompt = spec["prompt"].format(sentinel=sentinel)
    ask(root, prompt, model=spec["model"], tools=tuple(spec["tools"]))
    root.wait_quiet()
    rows = hook_rows(data_dir(root))
    assert any(r.get("tool_name") == "Bash" for r in rows), rows
    assert _hits(root.config / "projects", sentinel)
    return sentinel


@pytest.mark.requires_auth
def test_SENTINELは送信しても端末にもサーバにも残らない(root, gitsrv, server):
    install(root, gitsrv, version(1), ingest_config(server.port, server.token))
    sentinel = _leak_session(root)
    data = data_dir(root)
    # SessionStart の分は送信済み。UserPromptSubmit 以降は間引きで queue に残っている
    ids = {r["event_id"] for r in hook_rows(data)}
    assert ids
    assert _leaks(root, sentinel) == []
    (data / "sent_at").unlink()
    session(root)
    server.wait_event_ids(ids)
    db = server.copy_data(root.tmp / "server")
    # 取り出した DB を同じ走査で読めている証拠（自分の event_id は見つかる）
    assert _hits(db, min(ids))
    assert _hits(db, sentinel) == []
    assert _leaks(root, sentinel) == []
    for real in REAL_CONFIG_DIRS:
        assert _hits(real, sentinel) == [], real


@pytest.mark.requires_auth
def test_陽性対照_自由文のキーパスを足した契約では検出される(root, gitsrv):
    src = (PLUGIN_SRC / _CONTRACT).read_text(encoding="utf-8")
    head = "HOOK_FIELDS = (\n"
    assert src.count(head) == 1
    leaky = src.replace(head, head + _LEAKY_FIELDS).encode()
    install(root, gitsrv, version(1), {_CONTRACT: leaky})
    sentinel = _leak_session(root)
    leaks = _leaks(root, sentinel)
    assert leaks and all(data_dir(root) in p.parents for p in leaks), leaks
