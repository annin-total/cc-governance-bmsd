"""案 51 の氏名の検査（check.py から呼ぶ）: 名簿にいる利用者のメールが本文に出ない（title は除く）・名簿に無い人はメールで出る・絞り込みが氏名でもメールでも当たる。"""

import re

from check5 import goto

EMAIL = re.compile(r"user\d+@example\.com")
PAGES = ("?page=home", "?page=cost#user_cost", "?page=cost#over_users", "?page=activity#user_use", "?page=activity#user_calls", "?page=policy", "?page=collect")
TEXT_JS = "Array.from(document.querySelectorAll('main [data-panel]:not([hidden]), main .kpis')).map((e) => e.innerText).join('\\n')"
SHOWN_JS = "Array.from(document.querySelectorAll('#user_cost tbody tr')).filter((tr) => !tr.hidden).map((tr) => tr.querySelector('td.c-person').getAttribute('title') || tr.querySelector('td.c-person [title]').getAttribute('title'))"


def rule(page, base: str, data: dict) -> list:
    out = []
    rows = data["p"]["7"]["x"]["billed"]
    listed = {r["email"] for r in rows if r["dept"] is not None}
    unknown = {r["email"] for r in rows if r["dept"] is None}
    for q in PAGES:
        goto(page, base + q)
        leaked = sorted(set(EMAIL.findall(page.evaluate(TEXT_JS))) & listed)
        if leaked:
            out.append(f"氏名 {q}: 名簿にいる利用者のメールが本文に出る {leaked[:3]}")
    goto(page, f"{base}?page=cost#user_cost")
    text = page.evaluate(TEXT_JS)
    missing = sorted(e for e in unknown if e not in text)
    if missing:
        out.append(f"氏名: 名簿に無い利用者がメールで出ない {missing[:3]}")
    pick = next(r for r in rows if r["dept"] is not None)
    for word in (pick["name"], pick["email"]):
        page.fill("#user_cost [data-search]", word)
        if pick["email"] not in page.evaluate(SHOWN_JS):
            out.append(f"氏名: 「{word}」で絞り込んでも {pick['email']} の行が出ない")
    return out
