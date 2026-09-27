"""判定関数がゲートするかを、壊した状態を直接作って確かめる（claude は起動しない）。"""

import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import judge
import uc14_lib
from uc14_lib import AUTO_UPDATE, AUTOCOMPACT, DENY, MARKETPLACE, ONCE_KEY, USER

base = {"enabledPlugins": {"g@m": True}, "extraKnownMarketplaces": {MARKETPLACE: {"source": {}}}, **USER}
good = json.loads(json.dumps(base))
good["env"].update({AUTOCOMPACT.split(".")[1]: "60", ONCE_KEY.split(".")[1]: "first"})
good["permissions"]["deny"].append(DENY)
good["extraKnownMarketplaces"][MARKETPLACE]["autoUpdate"] = True
assert AUTO_UPDATE.endswith("autoUpdate")
base_b = json.dumps(base).encode()


def name_is_raw(mut) -> bool:
    return mut is RAW


def check(mut) -> bool:
    d = uc14_lib._orig(prefix="cc-e2e-a-14-gate-")  # uc06_lib の差し替えは位置引数に対応しない
    try:
        root = SimpleNamespace(config=Path(d))
        data = json.loads(json.dumps(good))
        text = mut(data) if name_is_raw(mut) else (mut(data), None)[1]
        (Path(d) / "settings.json").write_text(text if isinstance(text, str) else json.dumps(data))
        return judge.settings_checks(root, base_b).get("all_ok", False)
    finally:
        shutil.rmtree(d)


cases = {
    "正常": lambda d: None,
    "壊れた JSON": (RAW := lambda d: '{"theme": '),
    "利用者の値が消える": lambda d: d.pop("uc14_user"),
    "利用者の deny が消える": lambda d: d["permissions"]["deny"].remove("Bash(rm -rf /)"),
    "配布値の重複": lambda d: d["permissions"]["deny"].append(DENY),
    "配布値が無い": lambda d: d["env"].pop("CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"),
    "enabledPlugins が消える": lambda d: d.pop("enabledPlugins"),
}
for name, fn in cases.items():
    print(name, "ok" if check(fn) else "NG")
