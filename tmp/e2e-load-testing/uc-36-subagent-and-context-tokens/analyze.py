"""UC36: `.local/.../uc-36-subagent-and-context-tokens/queue-raw.jsonl` から表を作り、判定がゲートするか確かめる。

`--break` を付けると、行を人工的に壊してから判定し、検出できることを示す（緑を鵜呑みにしない）。
"""

import argparse
import json
import sys
from pathlib import Path

RAW = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-36-subagent-and-context-tokens/queue-raw.jsonl"
)

# context_tokens が入ってよい hook（collect.py の _CONTEXT_TOKEN_HOOK_EVENTS と一致するはず）
_CONTEXT_TOKEN_HOOKS = {"PreCompact", "Stop"}
_EXPECTED_AGENT_INVOCATIONS = 2


def load_rows(broken: bool) -> list:
    rows = [json.loads(line) for line in RAW.read_text("utf-8").splitlines() if line]
    if broken:
        # 人工的に壊す: サブエージェント境界で二重に出る Stop 行の 1 つを消す
        # （「もう重複していない」ように見せかける）
        removed = False
        for i, r in enumerate(rows):
            if not removed and r.get("kind") == "event" and r.get("hook_event") == "Stop":
                prompt_id = r.get("prompt_id")
                has_agent_call = any(
                    r2.get("prompt_id") == prompt_id
                    and r2.get("hook_event") == "PostToolUse"
                    and r2.get("tool_name") == "Agent"
                    for r2 in rows
                )
                if has_agent_call:
                    del rows[i]
                    removed = True
                    break
    return rows


def check(rows: list) -> None:
    events = [r for r in rows if r.get("kind") == "event"]

    # 1. context_tokens は PreCompact / Stop でしか入らない
    by_hook_ctx = {}
    for r in events:
        if r.get("context_tokens") is not None:
            by_hook_ctx.setdefault(r["hook_event"], 0)
            by_hook_ctx[r["hook_event"]] += 1
    print("context_tokens が入った hook_event:", by_hook_ctx)
    unexpected = set(by_hook_ctx) - _CONTEXT_TOKEN_HOOKS
    assert not unexpected, f"想定外の hook で context_tokens が入った: {unexpected}"
    assert by_hook_ctx.get("PreCompact", 0) >= 2, "PreCompact の観測が 2 回未満"
    assert by_hook_ctx.get("Stop", 0) >= 2, "Stop の観測が 2 回未満"

    # 2. agent_id: サブエージェントの呼出回数と一致し、親（agent_id=None）の行と重ならない
    agent_ids = {r["agent_id"] for r in events if r.get("agent_id") is not None}
    print("agent_id の値（サブエージェントのツール呼出のみに付く）:", sorted(agent_ids))
    assert len(agent_ids) == _EXPECTED_AGENT_INVOCATIONS, (
        f"agent_id の種類数が呼出回数と一致しない: {len(agent_ids)} != "
        f"{_EXPECTED_AGENT_INVOCATIONS}"
    )

    # 3. Stop 行は agent_id を持たないため、サブエージェント境界の Stop と
    #    親の Stop を区別できない（二重計上の危険）。この観測が再現することを確かめる。
    stop_rows = [r for r in events if r["hook_event"] == "Stop"]
    agent_call_prompt_ids = {
        r["prompt_id"] for r in events
        if r["hook_event"] == "PostToolUse" and r.get("tool_name") == "Agent"
    }  # fmt: skip
    ambiguous_stops = [r for r in stop_rows if r["prompt_id"] in agent_call_prompt_ids]
    print(
        f"Stop 総数: {len(stop_rows)} / うち Agent 呼出と同じ prompt_id を持つ"
        f"（親子どちらの Stop か agent_id からは判別できない）行: {len(ambiguous_stops)}"
    )
    assert len(ambiguous_stops) == _EXPECTED_AGENT_INVOCATIONS, (
        "サブエージェント境界の Stop 重複という既知の挙動が再現しない"
        f"（{len(ambiguous_stops)} 件、期待 {_EXPECTED_AGENT_INVOCATIONS} 件）。"
        "Claude Code 側の挙動が変わった可能性がある"
    )

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
