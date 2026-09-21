"""`/policy` 画面の集計クエリ。フレームワークを import しない。

現在時刻は読まない。基準日 `today`（epoch 日）は呼び出し側（`app.py`）が渡す。
準拠の判定は常に `prev_value` で行い、`apply_result` では行を絞らない（設計書 §5.2）。
"""

import db

POLICY_DAYS = 30
STALE_DAYS = 14

# 効果測定の基準にする施策項目。plugin_version の分布はこのキーを対象に数える。
REFERENCE_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"

_LATEST_VALUES_SQL = """
    SELECT user_email, host, prev_value, day, ts FROM (
      SELECT user_email, host, prev_value, day, ts,
             ROW_NUMBER() OVER (PARTITION BY user_email, host ORDER BY ts DESC) AS rn
        FROM policy_state
       WHERE key_name = ? AND day >= ?
    ) t
   WHERE rn = 1
"""


def _window_start(today: int) -> int:
    """`POLICY_DAYS` 日の窓の開始日（`today` を含む）を返す。"""
    return today - POLICY_DAYS + 1


def latest_values(conn, today: int, key_name: str) -> list:
    """`POLICY_DAYS` 日の窓で、端末（`user_email` x `host`）ごとの最新 1 行を返す。

    戻り値は `(user_email, host, prev_value, day, ts)` のタプルのリスト。
    窓より前にしか行が無い端末は含まれない。全期間に window 関数を走らせない。
    """
    cur = conn.cursor()
    cur.execute(db.q(_LATEST_VALUES_SQL), (key_name, _window_start(today)))
    return cur.fetchall()


def _distinct_users_with_cost(conn, today: int) -> set:
    """直近 `POLICY_DAYS` 日に `cost_daily` へコストが立っている `user_email` の集合。"""
    cur = conn.cursor()
    cur.execute(
        db.q("SELECT DISTINCT user_email FROM cost_daily WHERE day >= ?"),
        (_window_start(today),),
    )
    return {row[0] for row in cur.fetchall()}


def compliance_rate(conn, today: int, key_name: str, expected_value: str) -> list:
    """施策項目 1 つの準拠率を `[(numerator, denominator, rate)]` の 1 行で返す。

    分母は直近 `POLICY_DAYS` 日に `cost_daily` に居る利用者数。
    分子は、持っている端末のすべてで最新の `prev_value` がポリシー値に一致する利用者数
    （1 台でも未準拠なら未準拠。設計書 §7.2）。
    """
    rows = latest_values(conn, today, key_name)
    compliant_by_user: dict = {}
    for user_email, _host, prev_value, _day, _ts in rows:
        ok = prev_value == expected_value
        compliant_by_user[user_email] = compliant_by_user.get(user_email, True) and ok

    denom_users = _distinct_users_with_cost(conn, today)
    denominator = len(denom_users)
    numerator = sum(1 for u in denom_users if compliant_by_user.get(u, False))
    rate = round(numerator / denominator * 100, 1) if denominator else 0.0
    return [(numerator, denominator, rate)]


def non_compliant(conn, today: int, key_name: str, expected_value: str) -> list:
    """未準拠者の一覧を `(user_email, host, prev_value, day)` のタプルのリストで返す。

    最新 1 行のうち `prev_value` がポリシー値と一致しないものだけを残す。
    """
    rows = latest_values(conn, today, key_name)
    return [
        (user_email, host, prev_value, day)
        for user_email, host, prev_value, day, _ts in rows
        if prev_value != expected_value
    ]


def not_introduced(conn, today: int) -> list:
    """未導入者の一覧を `(user_email,)` のタプルのリストで返す。

    直近 `POLICY_DAYS` 日の `cost_daily` に居て、同期間の `policy_state`（施策項目を問わない）
    に 1 行も無い `user_email` を対象にする。
    """
    cur = conn.cursor()
    cur.execute(
        db.q(
            """
            SELECT c.user_email FROM (
              SELECT DISTINCT user_email FROM cost_daily WHERE day >= ?
            ) c
            LEFT JOIN (
              SELECT DISTINCT user_email FROM policy_state WHERE day >= ?
            ) p ON c.user_email = p.user_email
            WHERE p.user_email IS NULL
            ORDER BY c.user_email
            """
        ),
        (_window_start(today), _window_start(today)),
    )
    return cur.fetchall()


def stale_terminals(conn, today: int) -> list:
    """イベントが途絶えた端末を `(user_email, host, last_day)` のタプルのリストで返す。

    判定の対象は `policy_state`（`events` では判定しない）。`POLICY_DAYS` の窓の中で
    端末ごとの最終 `day` を取り、基準日との差が `STALE_DAYS` 以上のものを対象にする。
    """
    cur = conn.cursor()
    cur.execute(
        db.q(
            """
            SELECT user_email, host, MAX(day) AS last_day
              FROM policy_state
             WHERE day >= ?
             GROUP BY user_email, host
            HAVING ? - MAX(day) >= ?
             ORDER BY user_email, host
            """
        ),
        (_window_start(today), today, STALE_DAYS),
    )
    return cur.fetchall()


def plugin_version_distribution(conn, today: int, key_name: str) -> list:
    """端末ごとの最新 1 行の `plugin_version` を数えた `(plugin_version, count)` のリストを返す。"""
    cur = conn.cursor()
    cur.execute(
        db.q(
            """
            SELECT plugin_version, COUNT(*) FROM (
              SELECT user_email, host, plugin_version,
                     ROW_NUMBER() OVER (PARTITION BY user_email, host ORDER BY ts DESC) AS rn
                FROM policy_state
               WHERE key_name = ? AND day >= ?
            ) t
           WHERE rn = 1
           GROUP BY plugin_version
        """
        ),
        (key_name, _window_start(today)),
    )
    return cur.fetchall()
