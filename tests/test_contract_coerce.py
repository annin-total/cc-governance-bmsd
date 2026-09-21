"""coerce(value, type) による列型への変換を検証する。"""

import contract


def test_varchar_str_passthrough():
    assert contract.coerce("auto", "VARCHAR(255)") == "auto"


def test_varchar_int_to_str():
    assert contract.coerce(60, "VARCHAR(255)") == "60"


def test_varchar_bool_true_lowercase():
    assert contract.coerce(True, "VARCHAR(255)") == "true"


def test_varchar_none():
    assert contract.coerce(None, "VARCHAR(255)") is None


def test_integer_bool_false():
    assert contract.coerce(False, "INTEGER") == 0


def test_integer_bool_true():
    assert contract.coerce(True, "INTEGER") == 1


def test_integer_int():
    assert contract.coerce(120000, "INTEGER") == 120000


def test_integer_int_string():
    assert contract.coerce("120000", "INTEGER") == 120000


def test_integer_invalid_string():
    assert contract.coerce("yes", "INTEGER") is None


def test_integer_empty_string():
    assert contract.coerce("", "INTEGER") is None


def test_integer_float():
    assert contract.coerce(3.7, "INTEGER") is None


def test_integer_none():
    assert contract.coerce(None, "INTEGER") is None


def test_bigint_int():
    assert contract.coerce(4178, "BIGINT") == 4178


def test_bigint_int_string():
    assert contract.coerce("4178", "BIGINT") == 4178


def test_bigint_invalid_string():
    assert contract.coerce("-", "BIGINT") is None


def test_double_numeric_string():
    assert contract.coerce("6.382454", "DOUBLE") == 6.382454


def test_double_scientific_string():
    assert contract.coerce("4.60E-05", "DOUBLE") == 4.6e-05


def test_double_int_zero():
    assert contract.coerce(0, "DOUBLE") == 0.0


def test_double_invalid_string():
    assert contract.coerce("不明", "DOUBLE") is None


def test_double_none():
    assert contract.coerce(None, "DOUBLE") is None


def test_varchar_truncate_ascii():
    value = "a" * 40
    assert contract.coerce(value, "VARCHAR(32)") == "a" * 32


def test_varchar_exact_length_not_truncated():
    value = "a" * 32
    assert contract.coerce(value, "VARCHAR(32)") == value


def test_varchar_truncate_by_character_count():
    value = "あ" * 40
    assert contract.coerce(value, "VARCHAR(32)") == "あ" * 32
