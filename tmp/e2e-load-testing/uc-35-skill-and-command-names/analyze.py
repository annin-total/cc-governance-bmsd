"""UC35: `.local/.../uc-35-skill-and-command-names/queue-raw.jsonl` から表を作り、判定がゲートするか確かめる。

`--break` を付けると、行を人工的に壊してから判定し、検出できることを示す（緑を鵜呑みにしない）。
"""

import argparse
import json
import sys
from pathlib import Path

RAW = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-35-skill-and-command-names/queue-raw.jsonl"
)

# 期待する (command_name, command_source) の組（実採取で観測した値）
_EXPECTED_COMMANDS = {
    ("e2e-probe", "userSettings"),
    ("governance:e2e-plugin-cmd", "plugin"),
}
_EXPECTED_SKILLS = {"e2e-skill", "governance:e2e-plugin-skill"}


def load_rows(broken: bool) -> list:
    rows = [json.loads(line) for line in RAW.read_text("utf-8").splitlines() if line]
    if broken:
        # 人工的に壊す: プラグイン同梱スキルの skill_name を空にする
        for r in rows:
            if r.get("skill_name") == "governance:e2e-plugin-skill":
                r["skill_name"] = None
    return rows


def check(rows: list) -> None:
    events = [r for r in rows if r.get("kind") == "event"]
    commands = {
        (r["command_name"], r["command_source"])
        for r in events
        if r.get("command_name") is not None
    }
    skills = {r["skill_name"] for r in events if r.get("skill_name") is not None}

    print("command_name / command_source の組:", sorted(commands))
    print("skill_name の値:", sorted(skills))

    missing_cmd = _EXPECTED_COMMANDS - commands
    missing_skill = _EXPECTED_SKILLS - skills
    assert not missing_cmd, f"期待した command_name/command_source が無い: {missing_cmd}"
    assert not missing_skill, f"期待した skill_name が無い: {missing_skill}"

    # 組み込みスラッシュコマンド（/compact）は UserPromptExpansion を経由しない
    # （command_name/command_source を持たない）ことも確認する
    compact_expansions = [
        r for r in events
        if r["hook_event"] == "UserPromptExpansion" and r.get("command_name") == "compact"
    ]  # fmt: skip
    assert compact_expansions == [], "組み込みコマンドが UserPromptExpansion を持つようになった（要再調査）"

    print("OK: 期待した値がすべて揃っている")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--break", dest="broken", action="store_true")
    args = parser.parse_args()
    try:
        check(load_rows(args.broken))
    except AssertionError as e:
        print(f"NG: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
