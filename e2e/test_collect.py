"""モジュール 4（収集）: 本物の Claude Code が hooks.json の全 hook を呼び、契約の全キーパスが実データで埋まる。

要認証。入力は `samples/prompts.json`、期待値は installPath の hooks.json・contract.py・collect.py から導く。
キーパスと transcript 由来の列が埋まるかは「全行を通して非 NULL が 1 つ以上」で見る（上流の改名は無言の NULL になるため）。
"""

import ast
import json
import runpy
from pathlib import Path

import pytest
from _flow import ask, data_dir, install, install_path
from _market import version
from _root import hook_rows

_PROMPTS = Path(__file__).resolve().parent / "samples" / "prompts.json"


def _transcript_spec(collect_py: Path) -> tuple[tuple, list]:
    """collect.py から transcript を読む hook と、`_from_transcript` で埋める列名を読み出す。"""
    tree = ast.parse(collect_py.read_text("utf-8"))
    events = next(
        ast.literal_eval(n.value)
        for n in tree.body
        if isinstance(n, ast.Assign)
        and any(getattr(t, "id", None) == "_TRANSCRIPT_HOOK_EVENTS" for t in n.targets)
    )
    columns = [
        key.value
        for d in ast.walk(tree)
        if isinstance(d, ast.Dict)
        for key, value in zip(d.keys, d.values)
        if isinstance(value, ast.Call)
        and getattr(value.func, "id", None) == "_from_transcript"
    ]
    return events, columns


def _place_inputs(root, spec: dict) -> None:
    """ユーザー設定のコマンドとスキルを隔離した config に置く。"""
    cmd, skill = spec["command"], spec["skill"]
    (root.config / "commands").mkdir()
    (root.config / "commands" / f"{cmd['name']}.md").write_text(cmd["body"], "utf-8")
    skill_dir = root.config / "skills" / skill["name"]
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(skill["body"], "utf-8")


@pytest.mark.requires_auth
def test_全hookが発火し契約の全キーパスが埋まる(root, gitsrv):
    install(root, gitsrv, version(1))
    spec = json.loads(_PROMPTS.read_text(encoding="utf-8"))
    _place_inputs(root, spec)
    plan = spec["collect"]
    for s in plan["sessions"]:
        ask(root, *s["args"], model=s["model"], tools=tuple(plan["tools"]))
    root.wait_quiet()
    hooks = install_path(root) / "hooks"
    registered = set(json.loads((hooks / "hooks.json").read_text("utf-8"))["hooks"])
    fields = runpy.run_path(str(hooks / "contract.py"))["HOOK_FIELDS"]
    events, columns = _transcript_spec(hooks / "collect.py")
    assert registered and fields and columns
    all_rows = hook_rows(data_dir(root))
    assert [r for r in all_rows if r["kind"] == "error"] == []
    rows = [r for r in all_rows if r["kind"] == "event"]
    assert {r["hook_event"] for r in rows} == registered
    empty = [name for name, _, _ in fields if all(r[name] is None for r in rows)]
    assert empty == []
    read = [r for r in rows if r["hook_event"] in events]
    assert read
    assert [c for c in columns if all(r[c] is None for r in read)] == []
