"""状態の判定と閾値（設計 4.4 の constants の名前案の写し）。閾値ちょうどは該当する（「以上」）。"""

from typing import Iterable, Optional

OK, WARN, NG = "ok", "warn", "ng"
RANK = {NG: 0, WARN: 1, OK: 2}

COST_RISE = (10, 15)  # COST_RISE_ELEVATED・COST_RISE_HIGH（%）
USERS_DROP = (10, 15)  # USERS_DROP_ELEVATED・USERS_DROP_HIGH（%）
USER_COST_ELEVATED = {"day": 50, "week": 70, "month": 280}  # USD
USER_COST_HIGH = {"day": 100, "week": 150, "month": 600}
USER_COST_SPANS = (7, 28)
CORE_OUTDATED_ELEVATED = PLUGIN_OUTDATED_ELEVATED = 1  # 人
ERROR_COUNT_ELEVATED = 1  # 件
NON_COMPLIANT_USERS_HIGH = 1  # 人
NOT_INTRODUCED_ELEVATED = 1  # 人
NULL_RATE_ELEVATED, NULL_RATE_HIGH = 20, 50  # %


def change(now, prev) -> Optional[float]:
    return None if now is None or not prev else round((now - prev) / prev * 100, 1)


def over(value, elevated, high=None) -> Optional[str]:
    """`value` が `high` 以上なら要確認、`elevated` 以上なら注意。値が無ければ None。"""
    if value is None:
        return None
    if high is not None and value >= high:
        return NG
    return WARN if elevated is not None and value >= elevated else OK


def rise(rate, pair: tuple) -> Optional[str]:
    """増えた率（%）で判定する。"""
    return over(rate, *pair)


def drop(rate, pair: tuple) -> Optional[str]:
    """減った率（%）で判定する。`rate` は増減率（減ると負）。"""
    return None if rate is None else over(-rate, *pair)


def worst(tones: Iterable) -> str:
    known = [t for t in tones if t]
    return min(known, key=RANK.get) if known else OK
