"""案 51 の組織 CSV の月ごとの名簿の検査（check.py から呼ぶ）: 適用の決まり（その月→無ければ前の最新→前が無ければ後の最初）をデータと画面で確かめる。"""

import datetime as dt
import tempfile
from pathlib import Path

from check5 import goto

EPOCH = dt.date(1970, 1, 1)
ROWS_JS = "(sel) => Array.from(document.querySelectorAll(sel)).map((e) => [Number(e.dataset.month), Number(e.dataset.use)])"
GUESS_NAME, GUESS_MONTH = "org_202606.csv", "2026-06"


def _month(day: int) -> int:
    d = EPOCH + dt.timedelta(days=day)
    return (d.replace(day=1) - EPOCH).days


def expected(rosters: list, months: list) -> list:
    """決まりをここで書き直した、各月に使う名簿。"""
    have = sorted(r["month"] for r in rosters)
    out = []
    for m in months:
        before = [x for x in have if x <= m]
        out.append([m, before[-1] if before else min((x for x in have if x > m), default=None)])
    return out


def rule(page, base: str, data: dict) -> list:
    """データの applied・used と、OI4 の表・OI3 の帯が決まりどおり。先頭・途中・最新の欠けがある。OI5 はファイル名の年月を入れる。"""
    org, out = data["fixed"]["org"], []
    months = [a["month"] for a in org["applied"]]
    want = expected(org["rosters"], months)
    have = {r["month"] for r in org["rosters"]}
    gaps = [m for m in months if m not in have]
    if not gaps or gaps[0] != months[0] or months[-1] not in gaps or not any(months[0] < g < months[-1] for g in gaps):
        out.append("名簿: 先頭・途中・最新の欠けがそろっていない")
    if [[a["month"], a["use"]] for a in org["applied"]] != want:
        out.append("名簿: データの適用（applied）が決まりと合わない")
    end_use = dict(map(tuple, want)).get(_month(data["meta"]["end"]))
    if org["used"] != end_use:
        out.append("名簿: 期間の終わりの月に使う名簿（used）が決まりと合わない")
    for oi, sel in (("OI4", "#org tbody tr[data-month]"), ("OI3", "#org .org-cell")):
        goto(page, f"{base}?page=settings&oi={oi}")
        got = sorted(page.evaluate(ROWS_JS, sel))
        if got != sorted(want):
            out.append(f"名簿 {oi}: 画面の使う月が決まりと合わない")
    goto(page, f"{base}?page=settings&oi=OI5")
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / GUESS_NAME
        f.write_text("Email - Primary Work\n", encoding="utf-8")
        page.set_input_files("#org [data-org-guess]", str(f))
    if page.input_value("#org [data-org-month]") != GUESS_MONTH:
        out.append("名簿 OI5: ファイル名の年月が対象の年月に入らない")
    return out
