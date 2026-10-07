"""案 51 の部署の検査（check.py から呼ぶ。concepts5.md の 7 章）: 部署ごとの合計と部の行・利用率の列が無い・不明の行に札が無い・絞り込みの挙動と URL での引き継ぎ。"""

from urllib.parse import parse_qs, urlparse

from check5 import goto

PERIODS = ("7", "28", "12m")
DEPT, SEC = "Department A", "Department A|Section A3"
OTHER = "Department B"
UNKNOWN_TABS = ("user_cost", "over_users", "depts")
VISIBLE_JS = "(id) => Array.from(document.querySelectorAll(`#${id} tbody tr`)).filter((tr) => !tr.hidden && !tr.hasAttribute('data-dept-out')).map((tr) => [tr.dataset.dept, tr.dataset.sec, tr.dataset.kind || ''])"
DEPT_ROW_JS = "(d) => { const tr = document.querySelector(`#depts tbody tr[data-kind=dept][data-dept='${d}']`); return tr ? tr.textContent : null; }"


def data(d: dict) -> list:
    """depts の部の行と不明の行の合計が利用明細の人数・コストに一致し、部の行がその部の課の行の合計。"""
    out = []
    for k in PERIODS:
        rows, c = d["p"][k]["r5"]["depts"], d["p"][k]["r3"]["cost"]
        top = [r for r in rows if r["kind"] != "section"]
        if sum(r["users"] for r in top) != c["users"] or abs(sum(r["cost"] for r in top) - c["total"]) > 0.01:
            out.append(f"p.{k} depts の合計が利用明細の人数・コストと合わない")
        for dept in (r for r in rows if r["kind"] == "dept"):
            secs = [r for r in rows if r["kind"] == "section" and r["dept"] == dept["dept"]]
            if sum(r["users"] for r in secs) != dept["users"] or abs(sum(r["cost"] for r in secs) - dept["cost"]) > 0.01:
                out.append(f"p.{k} depts の部 {dept['dept']} が課の行の合計と合わない")
    return out


def screen(page, base: str) -> list:
    """利用率の列が無い・不明の行の課と部署に札が無い・絞り込み（部・課・解除）・部の行は課で絞っても変わらない・ページを移っても残る。"""
    out = []
    for period in PERIODS:
        goto(page, f"{base}?page=cost&period={period}#depts")
        heads = page.locator("#depts thead th").all_inner_texts()
        if any("利用率" in h for h in heads) or not page.locator("#depts tbody tr[data-kind=dept]").count():
            out.append(f"部署ごと {period}: 利用率の列があるか、部の行が無い（{heads}）")
    for tab in UNKNOWN_TABS:
        goto(page, f"{base}?page=cost#{tab}")
        bad = page.locator(f"#{tab} tbody tr[data-dept=unknown] :is(td.c-section, td.c-dept_name) .mark").count()
        if bad or (tab != "over_users" and not page.locator(f"#{tab} tbody tr[data-dept=unknown]").count()):
            out.append(f"{tab}: 不明の行が無いか、不明の行に札がある（{bad}）")
    goto(page, f"{base}?page=cost&df=F1#depts")
    before = page.evaluate(DEPT_ROW_JS, DEPT)
    page.locator(f"#depts [data-df-dept='{DEPT}']").check()
    off = page.evaluate("(d) => Array.from(document.querySelectorAll('#depts [data-df-sec]')).map((b) => [b.dataset.dfSec.split('|')[0] === d, b.disabled])", DEPT)
    if any(mine == dis for mine, dis in off):
        out.append("絞り込み: 選んだ部の課が押せないか、選んだ部に入らない課が押せる")
    rows = page.evaluate(VISIBLE_JS, "user_cost")
    if not rows or any(d != DEPT for d, _, _ in rows):
        out.append("絞り込み: 部で絞っても他の部の利用者が出る")
    if len({s for _, s, _ in rows}) < 2:
        out.append("絞り込み: 課を選ばないのに、選んだ部の課がすべて出ない")
    page.locator(f"#depts [data-df-sec='{SEC}']").check()
    if any(s != SEC for _, s, _ in page.evaluate(VISIBLE_JS, "user_cost")):
        out.append("絞り込み: 課で絞っても他の課の利用者が出る")
    shown = page.evaluate(VISIBLE_JS, "depts")
    if page.evaluate(DEPT_ROW_JS, DEPT) != before or [k for _, _, k in shown].count("dept") != 1 or any(k == "section" and s != SEC for _, s, k in shown):
        out.append("部署ごと: 課で絞ると部の行の値が変わるか、選んでいない課の行が出る")
    if any(d == OTHER for d, _, _ in shown):
        out.append("部署ごと: 選んでいない部の行が出る")
    page.click("header nav a[href*='page=activity']")
    page.wait_for_load_state("load")
    q = parse_qs(urlparse(page.url).query)
    if q.get("dept") != [DEPT] or q.get("sec") != [SEC] or any(d != DEPT for d, _, _ in page.evaluate(VISIBLE_JS, "user_use")):
        out.append(f"絞り込み: ページを移ると選んだ部署が残らない（{page.url}）")
    return out
