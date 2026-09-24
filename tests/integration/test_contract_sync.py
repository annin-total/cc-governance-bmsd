"""契約の正本と、サーバ側の複製・ハッシュ記録が一致していることを検査する。

契約がずれても実行時に例外は出ない（サーバ側の列定義を回して値を引くだけで、
増えた項目は黙って捨てられ、減った項目は黙って NULL になる）。この検査がそのずれを
唯一機械的に捕まえる層である（もう一層は submodule `server/` の `entry.sh`）。

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

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import sync_contract

ENTRY_SH = ROOT / "server" / "entry.sh"

_HEREDOC_PATTERN = re.compile(r"<<'PY'\n(.*?)\nPY\n", re.DOTALL)


@pytest.mark.parametrize("name", sync_contract.NAMES)
def test_master_replica_hash_exist(name):
    """正本 (plugin/hooks/<name>)・複製 (server/<name>)・ハッシュ記録が存在する。"""
    for path in sync_contract._paths(name):
        assert path.is_file(), f"見つからない: {path}"


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


def _load_entry_sh_checker() -> tuple:
    """`entry.sh` のヒアドキュメントから `_header` 関数と `NAMES` を取り出して返す。

    部分一致では変更を見落とすため、ヒアドキュメントを構文木として読み、関数定義だけを
    実行して得る（検査本体は実行しない）。取り出せなければ例外で落とす（検査対象 0 件で緑にしない）。
    """
    if not ENTRY_SH.is_file():
        raise FileNotFoundError(f"entry.sh が見つからない: {ENTRY_SH}")
    heredoc_match = _HEREDOC_PATTERN.search(ENTRY_SH.read_text(encoding="utf-8"))
    if heredoc_match is None:
        raise ValueError(
            f"{ENTRY_SH} から検査のヒアドキュメント（<<'PY' ... PY）が見つからない"
        )

    tree = ast.parse(heredoc_match.group(1))
    funcs = [
        n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_header"
    ]
    names = [
        n.value
        for n in tree.body
        if isinstance(n, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "NAMES" for t in n.targets)
    ]
    if len(funcs) != 1 or len(names) != 1:
        raise ValueError(
            f"{ENTRY_SH} から _header 関数と NAMES が 1 つずつ見つからない"
        )
    namespace: dict = {}
    exec(  # noqa: S102 (自リポジトリの関数定義だけを実行する)
        compile(ast.Module(body=funcs, type_ignores=[]), str(ENTRY_SH), "exec"),
        namespace,
    )
    return namespace["_header"], ast.literal_eval(names[0])


def test_entry_sh_header_matches_sync_contract_header():
    """`entry.sh` が検査する名前とヘッダが、`scripts/sync_contract.py` の生成物と同一である。

    サーバは `scripts/` を持たずに単独デプロイされるため、ヘッダの組み立ては
    `scripts/sync_contract.py` と `entry.sh` の 2 か所に重複して存在する（設計上避けられない）。
    ここを合わせ忘れると、層 2（この統合テスト群）は `sync_contract.py` 側だけを見るため
    緑のまま通り、層 1（`entry.sh`）だけが本番のサーバ起動時に複製との照合に失敗して落ちる、
    という「ローカル緑・本番死」が起きる。この不変条件を機械的に固定する。
    """
    entry_header, entry_names = _load_entry_sh_checker()
    assert tuple(entry_names) == sync_contract.NAMES
    for name in sync_contract.NAMES:
        assert entry_header(name).encode("utf-8") == sync_contract._header(name).encode(
            "utf-8"
        ), f"{ENTRY_SH} と scripts/sync_contract.py の {name} のヘッダが一致しない"
