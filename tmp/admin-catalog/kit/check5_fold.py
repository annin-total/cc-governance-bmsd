"""案 51 の一覧の折りたたみの検査（check.py から呼ぶ）: 決めた行数を超える一覧は、超えた行が初めは隠れ、押すと出て、もう一度押すと隠れる。行数以下の一覧に折りたたみが無い。"""

from check5 import goto

PAGES = ("?page=settings&rows=many", "?page=settings&rows=many&oi=OI4", "?page=summary&rows=many", "?page=settings")
ITEMS = ":scope > table > tbody > tr, :scope > .m-item"
STATE_JS = f"""() => Array.from(document.querySelectorAll('[data-fold]')).map((b) => {{
  const items = Array.from(b.querySelectorAll('{ITEMS}')), btn = b.nextElementSibling && b.nextElementSibling.matches('[data-fold-more]') ? b.nextElementSibling : null;
  return {{ n: Number(b.dataset.fold), shown: items.map((e) => e.getClientRects().length > 0), btn: btn ? btn.textContent : null }}; }})"""


def rule(page, base: str) -> list:
    out = []
    for q in PAGES:
        goto(page, base + q)
        boxes = page.evaluate(STATE_JS)
        if q.endswith("many") and not any(len(b["shown"]) > b["n"] for b in boxes):
            out.append(f"折りたたみ {q}: 行数を超える一覧が無い（見本が効いていない）")
        for i, b in enumerate(boxes):
            rest = len(b["shown"]) - b["n"]
            if rest <= 0:
                if b["btn"] is not None:
                    out.append(f"折りたたみ {q} {i}: 行数以下なのに折りたたみがある")
                continue
            if b["shown"] != [True] * b["n"] + [False] * rest or not b["btn"] or str(rest) not in b["btn"]:
                out.append(f"折りたたみ {q} {i}: 初めに {b['n']} 行を超えて出ているか、残りの件数のボタンが無い（{b['btn']}）")
                continue
            page.locator("[data-fold-more]").nth(sum(1 for x in boxes[:i] if len(x["shown"]) > x["n"])).click()
            if not all(page.evaluate(STATE_JS)[i]["shown"]):
                out.append(f"折りたたみ {q} {i}: 押しても残りが出ない")
            page.locator("[data-fold-more]").nth(sum(1 for x in boxes[:i] if len(x["shown"]) > x["n"])).click()
            if page.evaluate(STATE_JS)[i]["shown"] != b["shown"]:
                out.append(f"折りたたみ {q} {i}: 閉じても元に戻らない")
    return out
