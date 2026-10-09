"""モジュール 3（お知らせ）: installPath の notices.json の先頭の未読が SessionStart の systemMessage に現れる。

見本 `samples/notices.json` を組み立てたコピーに重ね、期待値は見本から導く。すべて認証不要。
"""

import json
from pathlib import Path

from _flow import data_dir, install, session
from _market import version
from _root import hook_rows

_SAMPLE = Path(__file__).resolve().parent / "samples" / "notices.json"
_DISABLE = {"CC_GOVERNANCE_DISABLE": "1"}


def _install(root, gitsrv) -> list:
    """見本を重ねて導入し、見本のお知らせを返す。"""
    data = _SAMPLE.read_bytes()
    install(root, gitsrv, version(1), {"notices.json": data})
    notices = json.loads(data)
    assert notices
    return notices


def _session_start_output(root, extra_env=None) -> dict:
    """1 セッション起動し、SessionStart hook の JSON 出力（stream-json の hook_response）を返す。"""
    lines = session(root, extra_env)
    outputs = [
        json.loads(e["output"])
        for e in lines
        if e.get("subtype") == "hook_response" and e.get("hook_event") == "SessionStart"
    ]
    assert len(outputs) == 1, lines
    return outputs[0]


def _assert_shown(output: dict, notices: list) -> None:
    """先頭の 1 件だけが出る。"""
    message = output["systemMessage"]
    assert message == f"{notices[0]['title']}\n{notices[0]['body']}", message


def test_未読のお知らせが出て_pでは既読にしない(root, gitsrv):
    notices = _install(root, gitsrv)
    _assert_shown(_session_start_output(root), notices)
    # claude -p は CLAUDE_CODE_ENTRYPOINT が sdk- 始まりなので、表示だけして既読にしない
    assert not (data_dir(root) / "seen.json").exists()
    _assert_shown(_session_start_output(root), notices)
    assert not (data_dir(root) / "seen.json").exists()


def test_無効化スイッチで出ない(root, gitsrv):
    _install(root, gitsrv)
    assert "systemMessage" not in _session_start_output(root, _DISABLE)
    # 陽性対照: hook は動いている。無効化は収集を止め、設定の適用（policy 行）は止めない
    rows = hook_rows(data_dir(root))
    assert rows and {r["kind"] for r in rows} == {"policy"}, rows
