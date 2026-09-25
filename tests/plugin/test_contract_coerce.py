"""coerce(value, type) による列型への変換を検証する。"""

import contract
import pytest

_EQUAL_CASES = {
    "varchar_str_passthrough": ("auto", "VARCHAR(255)", "auto"),
    "varchar_int_to_str": (60, "VARCHAR(255)", "60"),
    "varchar_bool_true_lowercase": (True, "VARCHAR(255)", "true"),
    "integer_bool_false": (False, "INTEGER", 0),
    "integer_bool_true": (True, "INTEGER", 1),
    "integer_int": (120000, "INTEGER", 120000),
    "integer_int_string": ("120000", "INTEGER", 120000),
    "bigint_int": (4178, "BIGINT", 4178),
    "bigint_int_string": ("4178", "BIGINT", 4178),
    "double_numeric_string": ("6.382454", "DOUBLE", 6.382454),
    "double_scientific_string": ("4.60E-05", "DOUBLE", 4.6e-05),
    "double_int_zero": (0, "DOUBLE", 0.0),
    "varchar_truncate_ascii": ("a" * 40, "VARCHAR(32)", "a" * 32),
    "varchar_exact_length_not_truncated": ("a" * 32, "VARCHAR(32)", "a" * 32),
    "varchar_truncate_by_character_count": ("あ" * 40, "VARCHAR(32)", "あ" * 32),
    "integer_at_signed_64bit_max_passes": (2**63 - 1, "INTEGER", 2**63 - 1),
    "integer_at_signed_64bit_min_passes": (-(2**63), "INTEGER", -(2**63)),
}

_NONE_CASES = {
    "varchar_none": (None, "VARCHAR(255)"),
    "integer_invalid_string": ("yes", "INTEGER"),
    "integer_empty_string": ("", "INTEGER"),
    "integer_float": (3.7, "INTEGER"),
    "integer_none": (None, "INTEGER"),
    "bigint_invalid_string": ("-", "BIGINT"),
    "double_invalid_string": ("不明", "DOUBLE"),
    "double_none": (None, "DOUBLE"),
    "integer_over_signed_64bit_max_is_none": (2**63, "INTEGER"),
    "integer_under_signed_64bit_min_is_none": (-(2**63) - 1, "INTEGER"),
    "integer_40_digit_string_is_none": ("1" * 40, "INTEGER"),
    "varchar_dict_is_none": ({"skill": {"prompt": "secret"}}, "VARCHAR(255)"),
    "varchar_list_is_none": ([1, 2, 3], "VARCHAR(255)"),
}


@pytest.mark.parametrize(
    ("value", "type_", "expected"), _EQUAL_CASES.values(), ids=_EQUAL_CASES.keys()
)
def test_coerce_converts(value, type_, expected):
    assert contract.coerce(value, type_) == expected


@pytest.mark.parametrize(
    ("value", "type_"), _NONE_CASES.values(), ids=_NONE_CASES.keys()
)
def test_coerce_returns_none(value, type_):
    assert contract.coerce(value, type_) is None


def test_varchar_lone_surrogate_is_replaced():
    result = contract.coerce("\ud800", "VARCHAR(255)")
    assert "\ud800" not in result
    result.encode("utf-8")  # 例外にならないこと（符号化できることの確認）


def test_varchar_lone_surrogate_is_replaced_then_truncated():
    value = "a" * 30 + "\ud800" + "b" * 10
    result = contract.coerce(value, "VARCHAR(32)")
    assert len(result) == 32
    assert "\ud800" not in result
    result.encode("utf-8")
