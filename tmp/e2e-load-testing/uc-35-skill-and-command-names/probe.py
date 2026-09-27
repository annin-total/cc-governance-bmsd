"""UC35・UC36 共通の実採取スクリプト（一時・使い捨て）。

pytest e2e は使わず、e2e/_root.py・_flow.py・_market.py・_githttp.py を直接 import して
1 つの隔離ルートで一連のセッションを起動し、queue の生データを .local 側に保存する。
UC35（スキル名・コマンドの記録）と UC36（サブエージェントと context_tokens）の両方が、
この 1 回の実行結果を別々に集計する（API 費用を抑えるため、実行は 1 回だけ）。

実行:
    set -a; . <.env.local>; set +a; CC_E2E_RUN=c .venv/bin/python probe.py
"""

import json
import sys
from pathlib import Path

REPO = Path("/Users/terasawayuki/Documents/program/Development/bmsd-governance/work/wt-c")
sys.path.insert(0, str(REPO / "e2e"))

from _flow import ask, data_dir, install, install_path  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import version  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402

LOCAL_OUT = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing"
)

_USER_COMMAND = (
    "Do these steps in order, one tool call each, then reply with the single word done.\n"
    "1. Run the Bash command `echo e2e-ok`.\n"
    "2. Run the Bash command `ls nonexistent-e2e-path` (it is expected to fail).\n"
    "3. Invoke the Skill tool with skill `e2e-skill`.\n"
)
_USER_SKILL = (
    "---\nname: e2e-skill\ndescription: E2E probe skill (user). "
    "Use only when asked explicitly.\n---\nReply with the single word skill-ok.\n"
)
_PLUGIN_COMMAND = (
    "Invoke the Skill tool with skill `e2e-plugin-skill`, then reply with the single word done.\n"
)
_PLUGIN_SKILL = (
    "---\nname: e2e-plugin-skill\ndescription: E2E probe skill (plugin-bundled). "
    "Use only when asked explicitly.\n---\nReply with the single word plugin-skill-ok.\n"
)


def _place_user_inputs(root) -> None:
    (root.config / "commands").mkdir()
    (root.config / "commands" / "e2e-probe.md").write_text(_USER_COMMAND, "utf-8")
    skill_dir = root.config / "skills" / "e2e-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(_USER_SKILL, "utf-8")


def _plugin_overrides() -> dict:
    """publish 前の組み立てコピーにだけ足す（開発ツリーの plugin/ は汚さない）。"""
    return {
        "commands/e2e-plugin-cmd.md": _PLUGIN_COMMAND.encode(),
        "skills/e2e-plugin-skill/SKILL.md": _PLUGIN_SKILL.encode(),
    }


def main() -> None:
    root = E2ERoot()
    gitsrv = GitHttpServer(root.srv)
    try:
        install(root, gitsrv, version(1), overrides=_plugin_overrides())
        _place_user_inputs(root)

        # UC35: 利用者コマンド → 利用者スキル
        ask(
            root, "/e2e-probe", model="haiku",
            tools=("Bash(echo:*)", "Bash(ls:*)", "Skill"),
        )  # fmt: skip
        # UC35: プラグイン同梱コマンド → プラグイン同梱スキル
        ask(root, "--continue", "/governance:e2e-plugin-cmd", model="haiku", tools=("Skill",))
        # UC36: 1 回目の /compact（PreCompact・context_tokens の 1 回目の観測）
        ask(root, "--continue", "/compact", model="haiku")
        # UC36: サブエージェント 2 回（親と子の区別・agent_id の重複が無いか）
        ask(
            root, "--continue",
            "Use the Agent tool (subagent_type general-purpose) with the prompt: "
            "Run the Bash command `echo e2e-sub-1` and reply done. "
            "After it replies, run the Bash command `echo e2e-parent` yourself. "
            "Then reply with the single word done.",
            model="haiku", tools=("Bash(echo:*)", "Agent"),
        )  # fmt: skip
        ask(root, "--continue", "/compact", model="haiku")
        ask(
            root, "--continue",
            "Use the Agent tool (subagent_type general-purpose) with the prompt: "
            "Run the Bash command `echo e2e-sub-2` and reply done. "
            "Then reply with the single word done.",
            model="haiku", tools=("Agent",),
        )  # fmt: skip
        # UC36: Stop（context_tokens の 3 回目の観測）
        ask(root, "--continue", "Reply with the single word ok.", model="haiku")

        root.wait_quiet()
        hooks_dir = install_path(root) / "hooks"
        registered = sorted(
            json.loads((hooks_dir / "hooks.json").read_text("utf-8"))["hooks"]
        )
        rows = hook_rows(data_dir(root))

        for name, sub in (("uc-35-skill-and-command-names", "queue-raw.jsonl"),
                          ("uc-36-subagent-and-context-tokens", "queue-raw.jsonl")):
            out_dir = LOCAL_OUT / name
            out_dir.mkdir(parents=True, exist_ok=True)
            with (out_dir / sub).open("w", encoding="utf-8") as f:
                for r in rows:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")
            (out_dir / "registered-hooks.json").write_text(
                json.dumps(registered, ensure_ascii=False, indent=2), "utf-8"
            )
        print(f"claude --version の確認は別途。行数={len(rows)} registered={registered}")
    finally:
        root.cleanup()


if __name__ == "__main__":
    main()
