"""案のフォルダの全ページを撮る。期間の効くページは 7・28・12m、効かないページは 1 枚。幅 1440・fullPage・下段は最初のタブ。

使い方: python kit/shoot.py ideas/NN-<slug> [--out 撮った画像の置き場（既定は案のフォルダの shots/）]
コンソールのエラー（ページの例外を含む）と横スクロールを数え、1 つでもあれば終了コード 1 で終わる。
"""

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

WIDTH, HEIGHT = 1440, 900
PERIODS = ("7", "28", "12m")
PAGES_JS = "window.IA.pages.map((p) => ({ id: p.id, periods: Boolean(p.periods) }))"
OVERFLOW_JS = "document.documentElement.scrollWidth > document.documentElement.clientWidth"


def _args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("idea", type=Path)
    p.add_argument("--out", type=Path)
    return p.parse_args()


def _shoot(ctx, url: str, path: Path) -> tuple:
    """1 ページを撮り、(エラーの一覧, 横スクロールの有無) を返す。"""
    page = ctx.new_page()
    errors: list = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_load_state("load")
    overflow = page.evaluate(OVERFLOW_JS)
    page.screenshot(path=str(path), full_page=True)
    page.close()
    return errors, overflow


def main() -> None:
    args = _args()
    idea = args.idea.resolve()
    out = (args.out or idea / "shots").resolve()
    out.mkdir(parents=True, exist_ok=True)
    base = (idea / "index.html").as_uri()
    failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": WIDTH, "height": HEIGHT})
        probe = ctx.new_page()
        probe.goto(base)
        pages = probe.evaluate(PAGES_JS)
        probe.close()
        for pg in pages:
            for period in PERIODS if pg["periods"] else (None,):
                name = pg["id"] + (f"-{period}" if period else "")
                url = f"{base}?page={pg['id']}" + (f"&period={period}" if period else "")
                errors, overflow = _shoot(ctx, url, out / f"{name}.png")
                failed += bool(errors) + overflow
                status = "ok" if not errors and not overflow else f"errors={len(errors)} overflow={overflow}"
                print(f"{name}: {status}")
                for e in errors[:5]:
                    print(f"  {e}")
        browser.close()
    print(f"{out}: {'すべて正常' if not failed else f'{failed} 件の問題'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
