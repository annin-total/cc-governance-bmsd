"""契約の正本と、サーバ側の複製・ハッシュ記録が一致していることを検査する。

契約がずれても実行時に例外は出ない（サーバ側の列定義を回して値を引くだけで、
増えた項目は黙って捨てられ、減った項目は黙って NULL になる）。同期忘れを機械的に捕まえるのは、この検査と
`scripts/sync_contract.py --check` だけである（`server/ccgov/vendor_check.py` は複製の直接編集だけを捕まえる）。

**`import contract` に頼らない。**複製は `server/ccgov/vendor/` にあり、
"contract" という同名モジュールが正本・複製の 2 か所に存在しうる。どちらを import するかを
sys.path の順序に委ねると、一致検査の結果がその順序で無言に変わりかねないため、
ここでは正本・複製・ハッシュ記録をすべて生のバイト列として直接読み、
`scripts/sync_contract.py` と同じロジックで比較する（import 経由の検査ではない）。

正本・複製・ハッシュ記録のいずれかが見つからない場合は、検査対象 0 件で緑にせず、
明示的に落とす。
"""

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import sync_contract

VENDOR_CHECK = ROOT / "server" / "ccgov" / "vendor_check.py"


@pytest.mark.parametrize("name", sync_contract.NAMES)
def test_master_replica_hash_exist(name):
    """正本 (plugin/hooks/<name>)・複製 (server/ccgov/vendor/<name>)・ハッシュ記録が存在する。"""
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


def test_vendor_check_passes_on_synced_replicas():
    """サーバの起動時の検査が同期済みの複製で通る。`_header` の複製が `sync_contract` とずれると本番の起動だけが落ちる。"""
    spec = importlib.util.spec_from_file_location("vendor_check", VENDOR_CHECK)
    vendor_check = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vendor_check)
    assert vendor_check.NAMES == sync_contract.NAMES
    assert vendor_check.check() == []
