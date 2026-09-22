"""to_day(ts) による JST 日付の算出を検証する。"""

import contract


def test_to_day_just_before_day_boundary():
    """JST 2025-09-20 23:59:59 は day 20351。"""
    assert contract.to_day(1758380399) == 20351


def test_to_day_at_day_boundary():
    """JST 2025-09-21 00:00:00 は day 20352。"""
    assert contract.to_day(1758380400) == 20352


def test_to_day_mid_day():
    """JST 2025-09-21 05:26:40 は day 20352。"""
    assert contract.to_day(1758400000) == 20352


def test_to_day_just_before_next_boundary():
    """JST 2025-09-21 23:59:59 は day 20352。"""
    assert contract.to_day(1758466799) == 20352


def test_to_day_at_next_boundary():
    """JST 2025-09-22 00:00:00 は day 20353。"""
    assert contract.to_day(1758466800) == 20353
