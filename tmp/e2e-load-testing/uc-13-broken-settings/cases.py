"""UC 13 のケース。各関数は (root, base) を受け、settings.json をその形にする。"""

import json
import os
import subprocess

MP = "cc-marketplace-governance-bmsd"


def _s(root):
    return root.config / "settings.json"


def _obj(base: bytes) -> dict:
    return json.loads(base)


def _write(root, data) -> None:
    _s(root).write_bytes(data if isinstance(data, bytes) else data.encode())


def baseline(root, base):
    _write(root, base)


def truncated(root, base):
    _write(root, base[: len(base) // 2])


def trailing_comma(root, base):
    _write(root, base.rstrip().rstrip(b"}").rstrip() + b",\n}\n")


def empty(root, base):
    _write(root, b"")


def bom(root, base):
    _write(root, b"\xef\xbb\xbf" + base)


def latin1(root, base):
    o = _obj(base)
    o["note"] = "café"
    _write(root, json.dumps(o, ensure_ascii=False).encode("latin-1"))


def deep(root, base):
    o = _obj(base)
    o["deep"] = "@@"
    text = json.dumps(o).replace('"@@"', "[" * 5000 + "]" * 5000)
    _write(root, text)


def top_array(root, base):
    _write(root, json.dumps([_obj(base)]))


def top_null(root, base):
    _write(root, "null")


def env_string(root, base):
    o = _obj(base)
    o["env"] = "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60"
    _write(root, json.dumps(o, indent=2))


def ekm_array(root, base):
    o = _obj(base)
    o["extraKnownMarketplaces"] = [o["extraKnownMarketplaces"]]
    _write(root, json.dumps(o, indent=2))


def autoupdate_int(root, base):
    o = _obj(base)
    o["extraKnownMarketplaces"][MP]["autoUpdate"] = 1
    o["env"] = {"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": 60}
    _write(root, json.dumps(o, indent=2))


def autoupdate_str(root, base):
    o = _obj(base)
    o["extraKnownMarketplaces"][MP]["autoUpdate"] = "true"
    _write(root, json.dumps(o, indent=2))


def _big(mb: int):
    def fn(root, base):
        o = _obj(base)
        # 未知のキーに文字列を詰める。本体のスキーマ検証を通るかも観測対象
        o["permissions"] = {"allow": [f"Bash(echo {i:08d} padding-padding-padding)" for i in range(mb * 1024 * 1024 // 48)]}
        _write(root, json.dumps(o, indent=2))

    fn.__name__ = f"big_{mb}mb"
    return fn


def _pad(mb: float):
    def fn(root, base):
        o = _obj(base)
        o["zzPadding"] = "x" * int(mb * 1024 * 1024)
        _write(root, json.dumps(o))

    return fn


def readonly(root, base):
    _write(root, base)
    os.chmod(_s(root), 0o444)


def uchg(root, base):
    _write(root, base)
    subprocess.run(["chflags", "uchg", str(_s(root))], check=True)


def symlink(root, base):
    t = root.tmp / "target"
    t.mkdir(exist_ok=True)
    (t / "settings.json").write_bytes(base)
    os.symlink(t / "settings.json", _s(root))


def symlink_dangling(root, base):
    t = root.tmp / "target"
    os.symlink(t / "settings.json", _s(root))


def missing(root, base):
    pass


_BOTH = (False, True)
_USER = (False,)
CASES = [
    ("baseline", baseline, _USER),
    ("truncated", truncated, _BOTH),
    ("trailing_comma", trailing_comma, _BOTH),
    ("empty", empty, _BOTH),
    ("bom", bom, _BOTH),
    ("latin1", latin1, _BOTH),
    ("deep", deep, _BOTH),
    ("top_array", top_array, _BOTH),
    ("top_null", top_null, _BOTH),
    ("env_string", env_string, _BOTH),
    ("ekm_array", ekm_array, _BOTH),
    ("autoupdate_int", autoupdate_int, _USER),
    ("autoupdate_str", autoupdate_str, _USER),
    ("big_1mb", _big(1), _USER),
    ("big_10mb", _big(10), _USER),
    ("big_40mb", _big(40), _USER),
    ("readonly", readonly, _USER),
    ("uchg", uchg, _USER),
    ("symlink", symlink, _USER),
    ("symlink_dangling", symlink_dangling, _BOTH),
    ("missing", missing, _BOTH),
]
EXTRA = [
    ("pad_tiny", _pad(0.00001), _USER),
    ("pad_2MiB_minus", _pad((2097152 - 249 - 10) / 1048576), _USER),
    ("pad_2MiB_plus", _pad((2097152 - 249 + 10) / 1048576), _USER),
    ("pad_0.9mb", _pad(0.9), _USER),
    ("pad_1.0mb", _pad(1.0), _USER),
    ("pad_1.2mb", _pad(1.2), _USER),
    ("pad_1.5mb", _pad(1.5), _USER),
    ("pad_2mb", _pad(2), _USER),
    ("pad_5mb", _pad(5), _USER),
    ("pad_8mb", _pad(8), _USER),
    ("pad_12mb", _pad(12), _USER),
    ("big_5mb", _big(5), _USER),
    ("big_40mb_proj", _big(40), (True,)),
]
CASES += EXTRA
