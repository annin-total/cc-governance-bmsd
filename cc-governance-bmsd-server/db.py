"""DB 方言（SQLite / MySQL）の差をこの 1 ファイルに閉じ込める層。"""

import os
import sqlite3
from urllib.parse import urlparse

from shared import ddl

_SQLITE_PATH_PREFIX = "sqlite:///"

_TABLES = ("events", "policy_state", "cost_daily")

_INDEXES = (
    ("events", ("day", "user_email", "event_id")),
    ("events", ("skill_name", "day", "user_email", "event_id")),
    ("events", ("tool_name", "day", "user_email", "event_id")),
    ("events", ("day", "hook_event", "context_tokens")),
    ("policy_state", ("key_name", "prev_value", "user_email")),
    ("policy_state", ("user_email", "ts")),
    ("cost_daily", ("day", "user_email")),
)


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


def _index_name(table: str, columns: tuple) -> str:
    """`ix_<テーブル名>_<列を _ で連結>` の形でインデックス名を組み立てる。"""
    return "ix_" + table + "_" + "_".join(columns)


def _existing_index_names(cur, table: str) -> set:
    """実テーブルに既にあるインデックス名の集合を取る（方言分岐はここ）。"""
    if _dialect() == "sqlite":
        cur.execute(f"PRAGMA index_list({table})")
        return {row[1] for row in cur.fetchall()}
    cur.execute(f"SHOW INDEX FROM {table}")
    return {row[2] for row in cur.fetchall()}


def _create_missing_indexes(cur) -> None:
    """無いインデックスだけを作る。`CREATE INDEX IF NOT EXISTS` は使わない。"""
    existing_by_table = {table: _existing_index_names(cur, table) for table in _TABLES}
    for table, columns in _INDEXES:
        name = _index_name(table, columns)
        if name in existing_by_table[table]:
            continue
        columns_sql = ", ".join(columns)
        cur.execute(f"CREATE INDEX {name} ON {table} ({columns_sql})")


def init() -> None:
    """契約から DDL を組み立てて実行し、不足しているインデックスを作る。"""
    conn = connect()
    try:
        cur = conn.cursor()
        for statement in ddl():
            cur.execute(statement)
        _create_missing_indexes(cur)
        conn.commit()
    finally:
        conn.close()
