"""SENTINEL の走査。完全一致・断片・符号化された形をバイト列で探す。シンボリックリンクはたどらない。"""

import base64
import json
import os
import urllib.parse
from pathlib import Path
from typing import Iterable, Optional

_MAX_FILE = 64 * 1024 * 1024
_FRAG = 8


def forms(sentinel: str) -> dict:
    """探す形 → バイト列。乱数部は小文字 16 進の 32 文字。"""
    rand = sentinel.split("-", 1)[1]
    raw = sentinel.encode()
    out = {
        "exact": raw,
        "upper_hex": f"SENTINEL-{rand.upper()}".encode(),
        "head8": rand[:_FRAG].encode(),
        "tail8": rand[-_FRAG:].encode(),
        "json_u_escape": "".join(f"\\u{ord(c):04x}" for c in sentinel).encode(),
        "url": urllib.parse.quote(sentinel, safe="").encode(),
        "url_all": "".join(f"%{b:02X}" for b in raw).encode(),
        "utf16le": sentinel.encode("utf-16-le"),
    }
    for pad in range(3):
        enc = base64.b64encode(b"x" * pad + raw)
        # 端の 4 文字は前後のバイトに依存するので落とす
        out[f"b64_{pad}"] = enc[4:-4]
    return out


def match(data: bytes, table: dict) -> list:
    """table = {ラベル: forms()} 。当たった (ラベル, 形) の一覧。"""
    return [(label, name) for label, fs in table.items() for name, b in fs.items() if b in data]


def walk(top: Path, exclude: Iterable[Path] = (), since: Optional[float] = None):
    """通常ファイルを列挙する。`exclude` 配下と `since` より古いものを除く。"""
    excl = [Path(os.path.realpath(p)) for p in exclude]
    for d, dirs, files in os.walk(top, followlinks=False):
        dp = Path(d)
        dirs[:] = [x for x in dirs if not any(dp / x == e or e in (dp / x).parents for e in excl)]
        for name in files:
            p = dp / name
            try:
                st = p.lstat()
            except OSError:
                continue
            if p.is_symlink() or not p.is_file() or st.st_size > _MAX_FILE:
                continue
            if since is not None and st.st_mtime < since:
                continue
            yield p


def scan_tree(top: Path, table: dict, **kw) -> list:
    """(パス, [(ラベル, 形)]) の一覧。読めないものは飛ばす（並行する書き換えで消えうる）。"""
    hits = []
    for p in walk(top, **kw):
        try:
            data = p.read_bytes()
        except OSError:
            continue
        m = match(data, table)
        if m:
            hits.append((p, m))
    return hits


def redact(text: str, table: dict) -> str:
    """表示用。SENTINEL の完全一致をラベルに置き換える（本物の transcript に値を残さない）。"""
    for label, fs in table.items():
        text = text.replace(fs["exact"].decode(), f"<{label}>")
    return text


def self_test() -> None:
    """走査の形ごとに、仕込んだ入力で当たり、仕込まない入力で外れることを確かめる。"""
    s = "SENTINEL-0123456789abcdef0123456789abcdef"
    table = {"t": forms(s)}
    cases = {
        "exact": json.dumps({"k": f"pre {s} post"}).encode(),
        "upper_hex": s.upper().replace("SENTINEL-", "SENTINEL-").encode(),
        "head8": s[:9 + _FRAG].encode() + b"...",
        "tail8": b"..." + s[-_FRAG:].encode(),
        "json_u_escape": json.dumps({"k": s}).encode().replace(
            s.encode(), "".join(f"\\u{ord(c):04x}" for c in s).encode()),
        "url_all": "".join(f"%{b:02X}" for b in s.encode()).encode(),
        "utf16le": ("x" + s).encode("utf-16-le"),
        "b64_0": base64.b64encode(s.encode()),
        "b64_1": base64.b64encode(b"a" + s.encode()),
        "b64_2": base64.b64encode(b"ab" + s.encode()),
    }
    for form, blob in cases.items():
        hit = {n for _, n in match(blob, table)}
        assert form in hit, (form, hit)
    assert match(b"nothing here " * 1000, table) == []
