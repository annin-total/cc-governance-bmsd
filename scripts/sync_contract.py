#!/usr/bin/env python3
"""sync_contract.py — 端末とサーバが共有する定義の正本を、サーバ側の複製へ同期する。

対象は契約（`contract.py`）と標準設定（`policy.py`）の 2 つで、扱いは同じである。
正本: `plugin/hooks/<name>`（配布物。端末に同梱される）
複製: `server/<name>`（submodule の中。このスクリプトの生成物。直接編集しない）
記録: `server/<name の拡張子を .sha256 にしたもの>`（正本のハッシュ。複製と一緒にコミットする）

複製は固定の生成物ヘッダ（`_header`）＋正本のバイト列そのもの、という構成を取る。
これにより、複製ファイル単体（正本が手元に無い場所）でも、ヘッダの既知の長さを引いた残りを
ハッシュ化すれば正本のハッシュと比較でき、複製が直接編集されていないかを検査できる
（`server/entry.sh` がこの方式でサーバ起動時に検査する）。

使い方:
    python scripts/sync_contract.py          複製とハッシュを正本から書き出す
    python scripts/sync_contract.py --check  書き込まず、正本・複製・ハッシュの一致だけを検証する
"""

import argparse
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MASTER_DIR = ROOT / "plugin" / "hooks"
SERVER_DIR = ROOT / "server"
NAMES = ("contract.py", "policy.py")


def _header(name: str) -> str:
    """複製ファイルの先頭に必ず置く固定ヘッダ。

    バイト列を変えると、正本を持たない場所（entry.sh）での「ヘッダを除いた残りが
    正本のハッシュと一致するか」という検査が壊れるため、変更する場合は entry.sh 側の
    同じ定数も揃えて直すこと。
    """
    return (
        f'"""server/{name} — 生成物。直接編集しない。\n'
        "\n"
        f"正本: plugin/hooks/{name}\n"
        "`scripts/sync_contract.py` が正本から生成する。\n"
        "`scripts/sync_contract.py --check` で正本との一致を検証できる。\n"
        '"""\n'
        "\n"
    )


def _paths(name: str) -> tuple:
    """(正本, 複製, ハッシュ記録) のパス。"""
    return (
        MASTER_DIR / name,
        SERVER_DIR / name,
        (SERVER_DIR / name).with_suffix(".sha256"),
    )


def _read_master_bytes(master: Path) -> bytes:
    """正本のバイト列を読む。正本が無ければ例外で落ちる（検査対象0件で緑にしない）。"""
    if not master.is_file():
        raise FileNotFoundError(f"正本が見つからない: {master}")
    return master.read_bytes()


def _expected_replica_bytes(name: str, master_bytes: bytes) -> bytes:
    """正本のバイト列から、あるべき複製ファイルのバイト列を組み立てる。"""
    return _header(name).encode("utf-8") + master_bytes


def _master_hash(master_bytes: bytes) -> str:
    """正本のバイト列の sha256 16進文字列。"""
    return hashlib.sha256(master_bytes).hexdigest()


def sync() -> None:
    """正本から複製とハッシュ記録を書き出す。"""
    for name in NAMES:
        master, replica, hash_file = _paths(name)
        master_bytes = _read_master_bytes(master)
        replica.write_bytes(_expected_replica_bytes(name, master_bytes))
        hash_file.write_text(_master_hash(master_bytes) + "\n", encoding="utf-8")


def _check_one(name: str) -> list:
    """1 組の正本・複製・ハッシュ記録のずれを列挙する。"""
    errors = []
    master, replica, hash_file = _paths(name)
    master_bytes = _read_master_bytes(master)
    expected_hash = _master_hash(master_bytes)

    if not hash_file.is_file():
        errors.append(f"ハッシュ記録が見つからない: {hash_file}")
    else:
        recorded_hash = hash_file.read_text(encoding="utf-8").strip()
        if recorded_hash != expected_hash:
            errors.append(
                f"{hash_file.name} が正本の現在のハッシュと一致しない"
                f"（記録={recorded_hash} 正本の実際={expected_hash}）。"
                "正本を変更したら sync_contract.py を実行して同期すること"
            )

    if not replica.is_file():
        errors.append(f"複製が見つからない: {replica}")
    elif replica.read_bytes() != _expected_replica_bytes(name, master_bytes):
        errors.append(
            f"{replica} が正本と一致しない"
            "（複製を直接編集したか、正本を変更して同期し忘れた可能性がある）。"
            "sync_contract.py を実行して再生成すること"
        )

    return errors


def check() -> list:
    """すべての組の正本・複製・ハッシュ記録のずれを列挙する。ずれが無ければ空リスト。"""
    return [e for name in NAMES for e in _check_one(name)]


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
        print(f"OK: {', '.join(NAMES)} は正本と一致している")
        return 0

    sync()
    for name in NAMES:
        print(f"synced: {', '.join(str(p) for p in _paths(name)[1:])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
