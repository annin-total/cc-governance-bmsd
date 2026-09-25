"""モジュール 5（送信）: 届かなかった分は spool に残り、送信先を直した次のセッションで実サーバに届く。

認証不要・Docker 要。送信は claude の終了後も走る切り離されたプロセスなので、判定の前に静止を待つ。
共有 DB なので、判定は自分の event_id だけで行う。再送の打ち切り・2xx 以外の扱いは tests/ が見る。
"""

import socket

import pytest
from _flow import data_dir, ingest_config, install, install_path, session
from _market import version
from _root import hook_rows


def _closed_port() -> int:
    """いま誰も待ち受けていないポート（取って即座に閉じる）。"""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.parametrize("broken", ["wrong_token", "closed_port"])
def test_届かなければspoolに残り直した次のセッションで届く(
    root, gitsrv, server, broken
):
    good = ingest_config(server.port, server.token)
    bad = (
        ingest_config(server.port, server.token + "x")
        if broken == "wrong_token"
        else ingest_config(_closed_port(), server.token)
    )
    install(root, gitsrv, version(1), bad)
    session(root)
    root.wait_quiet()
    data = data_dir(root)
    rows = hook_rows(data)
    # spool を作るのは送信プロセスだけ（動いた証拠）。queue には後続の UserPromptSubmit が残りうる
    assert list((data / "spool").glob("*.jsonl"))
    assert any(r.get("hook_event") == "SessionStart" for r in rows), rows
    ids = {r["event_id"] for r in rows}
    assert not ids & server.event_ids()
    # 送信先は実行時に installPath の config.json から読まれる
    (install_path(root) / "config.json").write_bytes(good["config.json"])
    # 10 分の間引きを待たずに次の送信を起こす（sent_at が無ければ送る）
    (data / "sent_at").unlink()
    session(root)
    server.wait_event_ids(ids)
    root.wait_quiet()
    assert list((data / "spool").glob("*.jsonl")) == []
