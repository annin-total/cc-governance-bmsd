"""凍結した案（31）の検査: 撮り直した画像が、コミット済みの shots/ と画素で一致するか（PNG のバイトでなく、読み込んだ画素で比べる）。

使い方: python kit/check_frozen.py ideas/31-skeleton（playwright と Pillow の入った Python で）。
1 枚でも違えば、撮影が失敗すれば、画像の組が違えば終了コード 1。撮り直した画像は一時ディレクトリに置き、shots/ は書き換えない。
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops

KIT = Path(__file__).resolve().parent


def _diff(a: Path, b: Path) -> str:
    """違いの説明。同じなら空文字。"""
    x, y = Image.open(a).convert("RGBA"), Image.open(b).convert("RGBA")
    if x.size != y.size:
        return f"大きさが違う {x.size} → {y.size}"
    box = ImageChops.difference(x, y).getbbox(alpha_only=False)  # 既定（True）は RGBA のアルファだけを見て色の違いを見逃す
    return f"画素が違う（範囲 {box}）" if box else ""


def main() -> None:
    idea = Path(sys.argv[1]).resolve()
    want = idea / "shots"
    problems = []
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        run = subprocess.run([sys.executable, str(KIT / "shoot.py"), str(idea), "--out", str(out)], capture_output=True, text=True)
        if run.returncode:
            problems.append(f"撮影が失敗した（終了コード {run.returncode}）: {run.stdout[-500:]}")
        have = {p.name for p in out.glob("*.png")}
        base = {p.name for p in want.glob("*.png")}
        problems += [f"{n}: 基準に無い画像" for n in sorted(have - base)] + [f"{n}: 撮り直せなかった" for n in sorted(base - have)]
        for n in sorted(have & base):
            d = _diff(want / n, out / n)
            if d:
                problems.append(f"{n}: {d}")
    for p in problems:
        print(p)
    print(f"{len(base)} 枚を比べた · " + ("すべて一致" if not problems else f"{len(problems)} 件の違い"))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
