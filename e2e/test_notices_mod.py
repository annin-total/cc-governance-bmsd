"""モジュール（お知らせ）: 配布経路で導入した mod が読み込まれ、installPath の notices.json を読む。

mod の振る舞いは `tests/mod/` が見る。ここは cache の配置からの読み込みと実パスだけを見る。認証不要。
"""

import json

from _flow import install, session
from _market import version

_NOTICES = [
    {"id": "e2e-1", "title": "E2E 一件目", "body": "本文 1"},
    {"id": "e2e-2", "title": "E2E 二件目", "body": "本文 2"},
]


def test_導入したmodが_pで未読を1件ずつui_logに出し既読にしない(root, gitsrv):
    install(root, gitsrv, version(1), {"notices.json": json.dumps(_NOTICES).encode()})
    logs = [
        e["text"]
        for e in session(root)
        if e.get("subtype") == "ui_log" and e.get("plugin") == "governance"
    ]
    assert len(logs) == len(_NOTICES), logs
    for notice, text in zip(_NOTICES, logs):
        assert notice["title"] in text and notice["body"] in text, text
    store = root.config / "plugins" / "store"
    assert not [p for p in store.glob("governance_*") if "seen:" in p.read_text()]
