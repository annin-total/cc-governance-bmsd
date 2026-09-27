"""判定のゲート確認用に、壊した／窓を広げた _settings.py を .local に書き出す。"""

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SRC = (REPO / "plugin" / "hooks" / "_settings.py").read_text(encoding="utf-8")
OUT = Path(sys.argv[1])


def _sub(src: str, old: str, new: str) -> str:
    assert src.count(old) == 1, old
    return src.replace(old, new)


# 原子的置換をやめ、本体を直接 2 回に分けて書く（読み手が書きかけを見る）
nonatomic = _sub(SRC, "        os.replace(tmp_path, config_path)\n",
    "        import time as _t\n"
    "        text = Path(tmp_path).read_text(encoding='utf-8')\n"
    "        os.remove(tmp_path)\n"
    "        with open(config_path, 'w', encoding='utf-8') as f2:\n"
    "            f2.write(text[: len(text) // 2]); f2.flush(); _t.sleep(0.05); f2.write(text[len(text) // 2 :])\n")
# 読んでから書くまでの窓を 0.3 秒に広げる（mtime の検査が競合を拾うかを見る）
widen = _sub(SRC, "    status, data, mtime_ns = _load(config_path)\n",
    "    status, data, mtime_ns = _load(config_path)\n    import time as _t\n    _t.sleep(0.3)\n")
(OUT / "mutant_nonatomic.py").write_text(nonatomic, encoding="utf-8")
(OUT / "amp_widen.py").write_text(widen, encoding="utf-8")
