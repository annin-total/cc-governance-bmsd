"""UC39 の検査ケース。1 ケース = 検査対象の 1 行（バイト列）と期待。"""

import json
import time

NOW = int(time.time())
XSS_SCRIPT = "<script>alert(1)</script>"
XSS_ATTR = '"><img src=x onerror=alert(2)>'
REF_KEY = "env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"


def ev(tag: str, **fields) -> dict:
    row = {
        "kind": "event",
        "event_id": f"bad-{tag}",
        "ts": NOW,
        "session_id": f"uc39-{tag}",
        "hook_event": "PostToolUse",
    }
    row.update(fields)
    return row


def line(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=True).encode()


def raw(tag: str, value_json: str, col: str = "skill_name") -> bytes:
    """JSON の文字列値の部分を生で埋め込む（エスケープや不正バイトを試すため）。"""
    head = line(ev(tag))[:-1]
    return (
        head
        + b', "'
        + col.encode()
        + b'": '
        + value_json.encode("utf-8", "surrogatepass")
        + b"}"
    )


def _l(n):
    return lambda r: (
        r is not None and r.get("skill_name") is not None and len(r["skill_name"]) == n
    )


# (名前, 検査対象の行, 期待: {"status", "stored", "dropped", "check": 保存された行 -> bool})
# stored/dropped は「正常行 2 + 対象行」の合計。check は対象行が保存されたときだけ見る
CASES = [
    (
        "long_ascii_300",
        line(ev("long_ascii_300", skill_name="a" * 300)),
        {"stored": 3, "check": _l(255)},
    ),
    (
        "long_kana_300",
        line(ev("long_kana_300", skill_name="あ" * 300)),
        {"stored": 3, "check": _l(255)},
    ),
    (
        "emoji_nonbmp_300",
        line(ev("emoji_nonbmp_300", skill_name="🧪" * 300)),
        {"stored": 3, "check": _l(255)},
    ),
    (
        "zwj_at_boundary",
        line(ev("zwj_at_boundary", skill_name="a" * 253 + "👨‍👩‍👧")),
        {"stored": 3, "check": lambda r: r["skill_name"] == "a" * 253 + "👨‍"},
    ),
    (
        "combining_at_boundary",
        line(ev("combining_at_boundary", skill_name="a" * 254 + "é")),
        {"stored": 3, "check": lambda r: r["skill_name"] == "a" * 254 + "e"},
    ),
    (
        "escaped_pair",
        raw("escaped_pair", '"\\ud83d\\ude00"'),
        {"stored": 3, "check": lambda r: r["skill_name"] == "😀"},
    ),
    (
        "lone_surrogate",
        raw("lone_surrogate", '"x\\ud83dy"'),
        {"stored": 3, "check": lambda r: r["skill_name"] == "x?y"},
    ),
    (
        "invalid_utf8_bytes",
        raw("invalid_utf8_bytes", '"ok"')[:-5] + b'"\xff\xfe\xc3"}',
        {"stored": 2, "dropped": 1},
    ),
    (
        "overlong_utf8",
        raw("overlong_utf8", '"ok"')[:-5] + b'"\xc0\xaf"}',
        {"stored": 2, "dropped": 1},
    ),
    (
        "cesu_surrogate_bytes",
        raw("cesu_surrogate_bytes", '"ok"')[:-5] + b'"\xed\xa0\xbd"}',
        {"stored": 3, "check": lambda r: r["skill_name"] == "?"},
    ),
    (
        "utf8_bom_line",
        b"\xef\xbb\xbf" + line(ev("utf8_bom_line", skill_name="bom")),
        {"stored": 3},
    ),
    (
        "escaped_controls",
        line(ev("escaped_controls", skill_name="a\u0000b\nc\rd\te\u001b[31mf\u007f g")),
        {
            "stored": 3,
            "check": lambda r: (
                r["skill_name"] == "a\u0000b\nc\rd\te\u001b[31mf\u007f g"
            ),
        },
    ),
    (
        "raw_control_in_string",
        raw("raw_control_in_string", '"a\x01b"'),
        {"stored": 2, "dropped": 1},
    ),
    (
        "raw_cr_line_end",
        line(ev("raw_cr_line_end", skill_name="crlf")) + b"\r",
        {"stored": 3},
    ),
    (
        "int_as_varchar",
        line(ev("int_as_varchar", skill_name=123)),
        {"stored": 3, "check": lambda r: r["skill_name"] == "123"},
    ),
    (
        "bool_as_varchar",
        line(ev("bool_as_varchar", skill_name=True)),
        {"stored": 3, "check": lambda r: r["skill_name"] == "true"},
    ),
    (
        "dict_as_varchar",
        line(ev("dict_as_varchar", skill_name={"a": 1})),
        {"stored": 3, "check": lambda r: r["skill_name"] is None},
    ),
    (
        "nan_inf",
        raw("nan_inf", "NaN"),
        {"stored": 3, "check": lambda r: r["skill_name"] == "nan"},
    ),
    (
        "str_as_int",
        line(ev("str_as_int", context_tokens="12")),
        {"stored": 3, "check": lambda r: r["context_tokens"] == 12},
    ),
    (
        "float_as_int",
        line(ev("float_as_int", context_tokens=1.5)),
        {"stored": 3, "check": lambda r: r["context_tokens"] is None},
    ),
    (
        "int_overflow",
        line(ev("int_overflow", context_tokens=2**64)),
        {"stored": 3, "check": lambda r: r["context_tokens"] is None},
    ),
    (
        "int_5000_digits",
        raw("int_5000_digits", "9" * 5000, col="context_tokens"),
        {"stored": 2, "dropped": 1},
    ),
    (
        "eid_dict",
        line(ev("eid_dict", event_id={"a": 1})),
        {"stored": 3, "check": lambda r: r["event_id"] is None},
    ),
    ("eid_zero", line(ev("eid_zero", event_id=0)), {"stored": 2, "dropped": 1}),
    (
        "eid_long_100",
        line(ev("eid_long_100", event_id="e" * 100)),
        {"stored": 3, "check": lambda r: r["event_id"] == "e" * 36},
    ),
    (
        "ts_bool",
        line(ev("ts_bool", ts=True)),
        {"stored": 3, "check": lambda r: r["ts"] == 1},
    ),
    ("ts_float", line(ev("ts_float", ts=float(NOW))), {"stored": 2, "dropped": 1}),
    (
        "ts_str",
        line(ev("ts_str", ts=str(NOW))),
        {"stored": 3, "check": lambda r: r["ts"] == NOW},
    ),
    (
        "kind_upper",
        line(dict(ev("kind_upper"), kind="Event")),
        {"stored": 2, "dropped": 1},
    ),
    ("json_array", b"[1,2,3]", {"stored": 2, "dropped": 1}),
    ("deep_nesting", raw("deep_nesting", "[" * 100000 + "]" * 100000), {"status": 500}),
    (
        "huge_value_10mb",
        line(ev("huge_value_10mb", skill_name="x" * 10_000_000)),
        {"stored": 3, "check": _l(255)},
    ),
    # No.33: 契約にない項目・欠けた項目・改名前の名前
    (
        "unknown_key",
        line(
            ev("unknown_key", skill_name="s", new_column="v", tool_input={"skill": "t"})
        ),
        {
            "stored": 3,
            "check": lambda r: r["skill_name"] == "s" and "new_column" not in r,
        },
    ),
    (
        "missing_keys",
        line({"kind": "event", "event_id": "bad-missing_keys", "ts": NOW}),
        {
            "stored": 3,
            "check": lambda r: r["session_id"] is None and r["hook_event"] is None,
        },
    ),
    (
        "renamed_key",
        line(ev("renamed_key", hook_event="PreCompact", trigger="auto")),
        {"stored": 3, "check": lambda r: r["compact_trigger"] is None},
    ),
]

# 画面の検査用。すべて保存されること（stored=3）だけを期待する
XSS_ROWS = [
    (
        "xss_skill",
        line(
            ev(
                "xss_skill",
                skill_name=XSS_SCRIPT,
                command_name=XSS_ATTR,
                command_source=XSS_SCRIPT,
                permission_mode=XSS_SCRIPT,
                effort_level=XSS_ATTR,
                source=XSS_SCRIPT,
            )
        ),
    ),
    (
        "xss_ctrl",
        line(
            ev(
                "xss_ctrl",
                skill_name="ctl\u0000\u001b[31m\u0007end",
                command_name="🧪" * 300,
            )
        ),
    ),
    (
        "xss_error",
        line(
            {
                "kind": "error",
                "event_id": "bad-xss_error",
                "ts": NOW,
                "stage": XSS_SCRIPT,
                "error_type": XSS_ATTR,
                "plugin_version": XSS_SCRIPT,
                "host": "uc39-xss_error",
            }
        ),
    ),
    (
        "xss_policy",
        line(
            {
                "kind": "policy",
                "event_id": "bad-xss_policy",
                "ts": NOW,
                "key_name": REF_KEY,
                "user_email": XSS_SCRIPT,
                "host": XSS_ATTR,
                "prev_value": XSS_SCRIPT + "\u0000",
                "value": "x",
                "plugin_version": XSS_ATTR,
            }
        ),
    ),
]
