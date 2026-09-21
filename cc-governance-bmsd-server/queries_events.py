"""`/assets` 画面の集計クエリ。フレームワークを import しない。

現在時刻は読まない。基準日 `today`（epoch 日）は呼び出し側（`app.py`）が渡す。
件数・利用者数は必ず `COUNT(DISTINCT event_id)` / `COUNT(DISTINCT user_email)` を通す
（設計書 §5.4）。`agent_id` はサブエージェント内のツール呼出にのみ付く（設計書 §7.3）。
"""

import db

RECENT_DAYS = 7


def _recent_window(today: int) -> tuple:
    """直近 `RECENT_DAYS` 日の開始日（含む）と終了日（`today` そのもの）を返す。"""
    return today - RECENT_DAYS + 1, today


def _previous_window(today: int) -> tuple:
    """直近の 1 つ前の `RECENT_DAYS` 日の開始日・終了日を返す。"""
    recent_start, _ = _recent_window(today)
    return recent_start - RECENT_DAYS, recent_start - 1


def skill_usage(conn, today: int) -> list:
    """`skill_name` 別の直近／前 7 日の呼出回数・利用者数を返す。

    戻り値は `(skill_name, recent_calls, recent_users, prev_calls, prev_users)` の
    タプルのリスト。直近の呼出回数の降順で並ぶ。
    """
    recent_start, recent_end = _recent_window(today)
    prev_start, prev_end = _previous_window(today)
    cur = conn.cursor()
    cur.execute(
        db.q(
            """
            WITH names AS (
              SELECT DISTINCT skill_name FROM events
               WHERE skill_name IS NOT NULL AND day BETWEEN ? AND ?
            ),
            recent AS (
              SELECT skill_name,
                     COUNT(DISTINCT event_id) AS calls,
                     COUNT(DISTINCT user_email) AS users
                FROM events
               WHERE skill_name IS NOT NULL AND day BETWEEN ? AND ?
               GROUP BY skill_name
            ),
            prev AS (
              SELECT skill_name,
                     COUNT(DISTINCT event_id) AS calls,
                     COUNT(DISTINCT user_email) AS users
                FROM events
               WHERE skill_name IS NOT NULL AND day BETWEEN ? AND ?
               GROUP BY skill_name
            )
            SELECT n.skill_name,
                   COALESCE(r.calls, 0), COALESCE(r.users, 0),
                   COALESCE(p.calls, 0), COALESCE(p.users, 0)
              FROM names n
              LEFT JOIN recent r ON n.skill_name = r.skill_name
              LEFT JOIN prev p ON n.skill_name = p.skill_name
             ORDER BY COALESCE(r.calls, 0) DESC, n.skill_name
            """
        ),
        (prev_start, recent_end, recent_start, recent_end, prev_start, prev_end),
    )
    return cur.fetchall()


def command_usage(conn, today: int) -> list:
    """`command_name` x `command_source` 別の直近／前 7 日の呼出回数・利用者数を返す。

    戻り値は `(command_name, command_source, recent_calls, recent_users, prev_calls, prev_users)`。
    値の分類辞書を持たず、生値のまま並べる。
    """
    recent_start, recent_end = _recent_window(today)
    prev_start, prev_end = _previous_window(today)
    cur = conn.cursor()
    cur.execute(
        db.q(
            """
            WITH names AS (
              SELECT DISTINCT command_name, command_source FROM events
               WHERE command_name IS NOT NULL AND day BETWEEN ? AND ?
            ),
            recent AS (
              SELECT command_name, command_source,
                     COUNT(DISTINCT event_id) AS calls,
                     COUNT(DISTINCT user_email) AS users
                FROM events
               WHERE command_name IS NOT NULL AND day BETWEEN ? AND ?
               GROUP BY command_name, command_source
            ),
            prev AS (
              SELECT command_name, command_source,
                     COUNT(DISTINCT event_id) AS calls,
                     COUNT(DISTINCT user_email) AS users
                FROM events
               WHERE command_name IS NOT NULL AND day BETWEEN ? AND ?
               GROUP BY command_name, command_source
            )
            SELECT n.command_name, n.command_source,
                   COALESCE(r.calls, 0), COALESCE(r.users, 0),
                   COALESCE(p.calls, 0), COALESCE(p.users, 0)
              FROM names n
              LEFT JOIN recent r
                ON n.command_name = r.command_name AND n.command_source = r.command_source
              LEFT JOIN prev p
                ON n.command_name = p.command_name AND n.command_source = p.command_source
             ORDER BY COALESCE(r.calls, 0) DESC, n.command_name, n.command_source
            """
        ),
        (prev_start, recent_end, recent_start, recent_end, prev_start, prev_end),
    )
    return cur.fetchall()


def subagent_ratio(conn, today: int) -> list:
    """直近 `RECENT_DAYS` 日の全イベントに対する、`agent_id` が非 NULL のイベントの割合を返す。

    戻り値は `[(numerator, denominator, rate)]`。分子・分母とも `COUNT(DISTINCT event_id)`。
    """
    recent_start, recent_end = _recent_window(today)
    cur = conn.cursor()
    cur.execute(
        db.q(
            """
            SELECT
              COUNT(DISTINCT event_id),
              COUNT(DISTINCT CASE WHEN agent_id IS NOT NULL THEN event_id END)
            FROM events
            WHERE day BETWEEN ? AND ?
            """
        ),
        (recent_start, recent_end),
    )
    denominator, numerator = cur.fetchone()
    rate = round(numerator / denominator * 100, 1) if denominator else 0.0
    return [(numerator, denominator, rate)]
