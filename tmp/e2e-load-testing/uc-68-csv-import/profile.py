"""実 CSV の構造だけを要約する（値は出さない）。引数: CSV のパス（複数）。"""

import csv
import sys
from collections import Counter

_BOM = b"\xef\xbb\xbf"


def _kind(v: str) -> str:
    if not v:
        return "empty"
    try:
        int(v)
        return "int"
    except ValueError:
        pass
    try:
        float(v)
        return "float"
    except ValueError:
        return "text"


def _profile(path: str) -> None:
    with open(path, "rb") as f:
        raw = f.read()
    bom, crlf, lf = raw[:3] == _BOM, raw.count(b"\r\n"), raw.count(b"\n")
    print(f"-- {len(raw)} bytes, BOM={bom}, CRLF={crlf}, LF={lf}")
    rows = list(csv.reader(raw.decode("utf-8-sig").splitlines()))
    header, body = rows[0], rows[1:]
    print(f"   columns={len(header)} rows={len(body)} header={header}")
    print(f"   row widths={dict(Counter(len(r) for r in body))}")
    for i, name in enumerate(header):
        vals = [r[i] if i < len(r) else "" for r in body]
        kinds = dict(Counter(_kind(v) for v in vals))
        print(f"   [{name}] distinct={len(set(vals))} kinds={kinds}")


for p in sys.argv[1:]:
    _profile(p)
