"""to_day(ts) による JST 日付の算出を検証する。"""

import contract
import pytest

_CASES = {
    "just_before_day_boundary": (1758380399, 20351),  # JST 2025-09-20 23:59:59
    "at_day_boundary": (1758380400, 20352),  # JST 2025-09-21 00:00:00
    "mid_day": (1758400000, 20352),  # JST 2025-09-21 05:26:40
    "just_before_next_boundary": (1758466799, 20352),  # JST 2025-09-21 23:59:59
    "at_next_boundary": (1758466800, 20353),  # JST 2025-09-22 00:00:00
}


@pytest.mark.parametrize(("ts", "expected"), _CASES.values(), ids=_CASES.keys())
def test_to_day(ts, expected):
    assert contract.to_day(ts) == expected
