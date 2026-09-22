#!/usr/bin/env python3
"""sync_contract.py — 契約の正本をサーバ側の複製へ同期する。

正本: `plugin/hooks/contract.py`（配布物。端末に同梱される）
複製: `cc-governance-bmsd-server/contract.py`（このスクリプトの生成物。直接編集しない）
記録: `cc-governance-bmsd-server/contract.sha256`（正本のハッシュ。複製と一緒にコミットする）

複製は固定の生成物ヘッダ（`_REPLICA_HEADER`）＋正本のバイト列そのもの、という構成を取る。
これにより、複製ファイル単体（正本が手元に無い場所）でも、ヘッダの既知の長さを引いた残りを
ハッシュ化すれば正本のハッシュと比較でき、複製が直接編集されていないかを検査できる
（`cc-governance-bmsd-server/entry.sh` がこの方式でサーバ起動時に検査する）。

使い方:
    python scripts/sync_contract.py          複製とハッシュを正本から書き出す
    python scripts/sync_contract.py --check  書き込まず、正本・複製・ハッシュの一致だけを検証する
"""

import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "plugin" / "hooks" / "contract.py"
SERVER_DIR = ROOT / "cc-governance-bmsd-server"
REPLICA = SERVER_DIR / "contract.py"
HASH_FILE = SERVER_DIR / "contract.sha256"

# 複製ファイルの先頭に必ず置く固定ヘッダ。バイト列を変えると、正本を持たない
# 場所（entry.sh）での「ヘッダを除いた残りが正本のハッシュと一致するか」という
# 検査が壊れるため、変更する場合は entry.sh 側の同じ定数も揃えて直すこと。
_REPLICA_HEADER = (
    '"""cc-governance-bmsd-server/contract.py — 生成物。直接編集しない。\n'
    "\n"
    "正本: plugin/hooks/contract.py\n"
    "`scripts/sync_contract.py` が正本から生成する。\n"
    "`scripts/sync_contract.py --check` で正本との一致を検証できる。\n"
    '"""\n'
    "\n"
)


def _read_master_bytes() -> bytes:
    """正本のバイト列を読む。正本が無ければ例外で落ちる（検査対象0件で緑にしない）。"""
    if not MASTER.is_file():
        raise FileNotFoundError(f"正本が見つからない: {MASTER}")
    return MASTER.read_bytes()


def _expected_replica_bytes(master_bytes: bytes) -> bytes:
    """正本のバイト列から、あるべき複製ファイルのバイト列を組み立てる。"""
    return _REPLICA_HEADER.encode("utf-8") + master_bytes


def _master_hash(master_bytes: bytes) -> str:
    """正本のバイト列の sha256 16進文字列。"""
    return hashlib.sha256(master_bytes).hexdigest()


def sync() -> None:
    """正本から複製とハッシュ記録を書き出す。"""
    master_bytes = _read_master_bytes()
    REPLICA.write_bytes(_expected_replica_bytes(master_bytes))
    HASH_FILE.write_text(_master_hash(master_bytes) + "\n", encoding="utf-8")


def check() -> list:
    """正本・複製・ハッシュ記録のずれを列挙する。ずれが無ければ空リスト。"""
    errors = []
    master_bytes = _read_master_bytes()
    expected_hash = _master_hash(master_bytes)

    if not HASH_FILE.is_file():
        errors.append(f"ハッシュ記録が見つからない: {HASH_FILE}")
    else:
        recorded_hash = HASH_FILE.read_text(encoding="utf-8").strip()
        if recorded_hash != expected_hash:
            errors.append(
                "contract.sha256 が正本の現在のハッシュと一致しない"
                f"（記録={recorded_hash} 正本の実際={expected_hash}）。"
                "正本を変更したら sync_contract.py を実行して同期すること"
            )

    if not REPLICA.is_file():
        errors.append(f"複製が見つからない: {REPLICA}")
    else:
        actual_replica_bytes = REPLICA.read_bytes()
        expected_replica_bytes = _expected_replica_bytes(master_bytes)
        if actual_replica_bytes != expected_replica_bytes:
            errors.append(
                f"{REPLICA} が正本と一致しない"
                "（複製を直接編集したか、正本を変更して同期し忘れた可能性がある）。"
                "sync_contract.py を実行して再生成すること"
            )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="複製とハッシュを書き換えず、正本との一致だけを検証する",
    )
    args = parser.parse_args()

    if args.check:
        errors = check()
        if errors:
            for message in errors:
                print(f"ERROR: {message}", file=sys.stderr)
            return 1
        print(f"OK: {REPLICA} は正本と一致している")
        return 0

    sync()
    print(f"synced: {REPLICA}")
    print(f"synced: {HASH_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
