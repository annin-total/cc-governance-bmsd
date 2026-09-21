"""DB 方言（SQLite / MySQL）の差をこの 1 ファイルに閉じ込める層。"""

import os
import sqlite3
from urllib.parse import urlparse

_SQLITE_PATH_PREFIX = "sqlite:///"


def _dialect() -> str:
    """`DB_DSN` のスキームから方言を決める。未設定・未知のスキームは例外にする。"""
    dsn = os.environ.get("DB_DSN")
    if not dsn:
        raise RuntimeError("DB_DSN が設定されていない")
    scheme = urlparse(dsn).scheme
    if scheme == "sqlite":
        return "sqlite"
    if scheme == "mysql":
        return "mysql"
    raise RuntimeError(f"未知の DB_DSN スキーム: {scheme}")


def _sqlite_path() -> str:
    """`sqlite:///<パス>` から絶対・相対いずれかのパスを取り出す。"""
    dsn = os.environ["DB_DSN"]
    return dsn[len(_SQLITE_PATH_PREFIX) :]


def _mysql_kwargs() -> dict:
    """`mysql://user:pass@host[:port]/db` を PyMySQL の接続引数へ分解する。"""
    parsed = urlparse(os.environ["DB_DSN"])
    return {
        "host": parsed.hostname,
        "port": parsed.port or 3306,
        "user": parsed.username,
        "password": parsed.password,
        "database": parsed.path.lstrip("/"),
    }


def connect():
    """方言に応じて `sqlite3` または `PyMySQL` の接続を返す。"""
    if _dialect() == "sqlite":
        return sqlite3.connect(_sqlite_path())
    import pymysql

    return pymysql.connect(**_mysql_kwargs())


def q(sql: str) -> str:
    """方言が mysql のときだけ `?` を `%s` に置き換える。それ以外は素通しする。"""
    if _dialect() == "mysql":
        return sql.replace("?", "%s")
    return sql
