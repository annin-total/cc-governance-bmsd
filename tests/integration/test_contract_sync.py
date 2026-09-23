"""契約の正本と、サーバ側の複製・ハッシュ記録が一致していることを検査する。

契約がずれても実行時に例外は出ない（サーバ側の列定義を回して値を引くだけで、
増えた項目は黙って捨てられ、減った項目は黙って NULL になる）。この検査がそのずれを
唯一機械的に捕まえる層である（もう一層は submodule `server/`（`cc-governance-monitor`）の `entry.sh`）。

**`import contract` に頼らない。**複製は別リポジトリ（submodule）の中にあり、
"contract" という同名モジュールが正本・複製の 2 か所に存在しうる。どちらを import するかを
sys.path の順序に委ねると、一致検査の結果がその順序で無言に変わりかねないため、
ここでは正本・複製・ハッシュ記録をすべて生のバイト列として直接読み、
`scripts/sync_contract.py` と同じロジックで比較する（import 経由の検査ではない）。

正本・複製・ハッシュ記録のいずれかが見つからない場合は、検査対象 0 件で緑にせず、
明示的に落とす。
"""

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import sync_contract

ENTRY_SH = ROOT / "server" / "entry.sh"

_HEREDOC_PATTERN = re.compile(r"<<'PY'\n(.*?)\nPY\n", re.DOTALL)
_HEADER_ASSIGN_PATTERN = re.compile(
    r'REPLICA_HEADER = \((.*?)\)\s*\.encode\("utf-8"\)', re.DOTALL
)


def test_master_exists():
    """正本 (plugin/hooks/contract.py) が存在する。"""
    assert sync_contract.MASTER.is_file(), (
        f"契約の正本が見つからない: {sync_contract.MASTER}"
    )


def test_replica_exists():
    """複製 (server/contract.py) が存在する。"""
    assert sync_contract.REPLICA.is_file(), (
        f"複製が見つからない: {sync_contract.REPLICA}"
    )


def test_hash_file_exists():
    """ハッシュ記録 (server/contract.sha256) が存在する。"""
    assert sync_contract.HASH_FILE.is_file(), (
        f"ハッシュ記録が見つからない: {sync_contract.HASH_FILE}"
    )


def test_master_replica_hash_in_sync():
    """正本・複製・ハッシュ記録の 3 つが一致している。

    ずれるパターンは 2 つ:
    - 複製を直接編集した（複製のバイト列がヘッダ+正本と一致しない）
    - 正本を変更して sync_contract.py を実行し忘れた
      （contract.sha256 が正本の現在のハッシュと一致しない）

    `sync_contract.check()` は `scripts/sync_contract.py` の実装そのものであり、
    ここでは import を経由せず、正本・複製・ハッシュ記録をファイルとして直接読んで比較する。
    """
    errors = sync_contract.check()
    assert not errors, (
        "契約の正本とサーバ側の複製がずれている:\n"
        + "\n".join(f"- {e}" for e in errors)
        + "\n`.venv/bin/python scripts/sync_contract.py` を実行して同期すること"
    )


def _extract_entry_sh_header() -> bytes:
    """`entry.sh` に埋め込まれた `REPLICA_HEADER` の値を、実際に entry.sh のソースから
    抽出して返す。部分一致では変更を見落とすため、entry.sh のヒアドキュメントの中から
    代入式そのものを取り出し、リテラルとして評価する。抽出できなければ例外で落とす
    （検査対象 0 件で緑にしない）。
    """
    if not ENTRY_SH.is_file():
        raise FileNotFoundError(f"entry.sh が見つからない: {ENTRY_SH}")

    entry_sh_text = ENTRY_SH.read_text(encoding="utf-8")

    heredoc_match = _HEREDOC_PATTERN.search(entry_sh_text)
    if heredoc_match is None:
        raise ValueError(
            f"{ENTRY_SH} から契約チェックのヒアドキュメント（<<'PY' ... PY）が見つからない"
        )

    header_match = _HEADER_ASSIGN_PATTERN.search(heredoc_match.group(1))
    if header_match is None:
        raise ValueError(
            f"{ENTRY_SH} のヒアドキュメントから REPLICA_HEADER の代入式が見つからない"
        )

    # 代入式の右辺は文字列リテラルの並び（暗黙の連結）のみで構成されており、
    # 式でも変数参照でもないため ast.literal_eval で安全に評価できる。
    header_value = ast.literal_eval(f"({header_match.group(1)})")
    if not isinstance(header_value, str):
        raise TypeError(
            f"{ENTRY_SH} の REPLICA_HEADER が文字列として評価できない: {header_value!r}"
        )
    return header_value.encode("utf-8")


def test_entry_sh_header_matches_sync_contract_header():
    """`entry.sh` の `REPLICA_HEADER` と `scripts/sync_contract.py` の `_REPLICA_HEADER` が
    同一バイト列である。

    サーバは `scripts/` を持たずに単独デプロイされるため、ヘッダ定数は
    `scripts/sync_contract.py` と `entry.sh` の 2 か所に重複して存在する（設計上避けられない）。
    ここを合わせ忘れると、層 2（この統合テスト群）は `sync_contract.py` 側の定数だけを見るため
    緑のまま通り、層 1（`entry.sh`）だけが本番のサーバ起動時に複製との照合に失敗して落ちる、
    という「ローカル緑・本番死」が起きる。この不変条件を機械的に固定する。
    """
    entry_sh_header = _extract_entry_sh_header()
    sync_contract_header = sync_contract._REPLICA_HEADER.encode("utf-8")
    assert entry_sh_header == sync_contract_header, (
        f"{ENTRY_SH} の REPLICA_HEADER と scripts/sync_contract.py の _REPLICA_HEADER が"
        "一致しない。どちらか一方だけを変更して他方を直し忘れている"
    )
