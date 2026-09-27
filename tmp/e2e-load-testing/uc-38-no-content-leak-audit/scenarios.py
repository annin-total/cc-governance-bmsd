"""監査のシナリオ。各シナリオは別の隔離ルートで動き、別の SENTINEL を仕込む。

`sentinels` はラベルの一覧。`by_design` は送られるのが仕様どおりのラベル（送られることを陽性として確かめる）。
`setup(root, s)` は導入前の準備、`asks(root, s)` は (claude -p の引数, 許すツール) の列を返す。
"""

import json
from dataclasses import dataclass, field
from typing import Callable

_LONG_LINES = 5000


@dataclass
class Scenario:
    name: str
    sentinels: tuple
    asks: Callable
    setup: Callable = lambda root, s: None
    by_design: tuple = ()
    leaky_contract: bool = False
    fail_first: bool = False
    synthetic: bool = False
    notes: list = field(default_factory=list)


def _write(path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _prompt_bash(root, s):
    return [((f"Run the Bash command `echo {s['prompt']}` once, then reply done.",), ("Bash(echo:*)",))]


def _read_setup(root, s):
    _write(root.project / "notes.txt", f"The code is {s['content']}\n" * 3)


def _read_asks(root, s):
    return [(("Read the file notes.txt and reply with only the code it contains.",), ("Read",))]


def _write_asks(root, s):
    p = (
        f"Use the Write tool to create out.txt containing the single line `{s['write']}`. "
        f"Then use the Edit tool to replace `{s['write']}` with `{s['edit']}` in out.txt. Then reply done."
    )
    return [((p,), ("Write", "Edit"))]


def _path_setup(root, s):
    _write(root.project / f"{s['path']}-dir" / "hello.txt", "hello\n")


def _path_asks(root, s):
    p = "Use the Glob tool with pattern `**/*.txt`, then use the Read tool on each file found. Then reply done."
    return [((p,), ("Glob", "Read"))]


def _error_asks(root, s):
    p = (
        f"Run the Bash command `ls {s['ls']}-missing` (it is expected to fail). "
        f"Then use the Read tool on `{root.project}/{s['read']}-missing.txt` (it is expected to fail). "
        "Then reply done."
    )
    return [((p,), ("Bash(ls:*)", "Read"))]


def _agent_asks(root, s):
    p = (
        "Use the Agent tool (subagent_type general-purpose) with the prompt: "
        f"Run the Bash command `echo {s['agent']}` and reply done. Then reply with the single word done."
    )
    return [((p,), ("Agent", "Bash(echo:*)"))]


def _long_setup(root, s):
    _write(root.project / "gen.sh", f'for i in $(seq 1 {_LONG_LINES}); do echo "line $i {s["long"]}"; done\n')


def _long_asks(root, s):
    p = "Run the Bash command `bash gen.sh` exactly once, then reply with the single word done."
    return [((p,), ("Bash(bash gen.sh)",))]


def _cmd_setup(root, s):
    _write(root.config / "commands" / "echoarg.md", "Run the Bash command `echo $ARGUMENTS` once, then reply done.\n")
    _write(
        root.config / "skills" / "argskill" / "SKILL.md",
        "---\nname: argskill\ndescription: Audit probe skill. Use only when asked explicitly.\n---\n"
        "Reply with the single word skill-ok.\n",
    )


def _cmd_asks(root, s):
    return [
        ((f"/echoarg {s['cmdarg']}",), ("Bash(echo:*)",)),
        (("--continue", f"Invoke the Skill tool with skill `argskill` and args `{s['skillarg']}`. Then reply done."),
         ("Skill",)),
    ]  # fmt: skip


def _compact_asks(root, s):
    return [
        ((f"Remember this code: {s['remember']}. Reply with exactly the code and nothing else.",), ()),
        (("--continue", f"/compact Keep the code {s['compact']} in the summary."), ()),
        (("--continue", "Reply with the code you were asked to remember, and nothing else."), ()),
    ]


def _cfg_setup(root, s):
    cfg = root.path / f"cfg-{s['cfgpath']}"
    cfg.mkdir()
    root.config = cfg
    settings = {"env": {"AUDIT_NOTE": s["settings_env"], "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": s["managed"]}}
    _write(cfg / "settings.json", json.dumps(settings, indent=2))


def _cfg_asks(root, s):
    return [(("Run the Bash command `echo hello-cfg` once, then reply done.",), ("Bash(echo:*)",))]


def _pc_asks(root, s):
    return [((f"Run the Bash command `echo {s['pc']}` once, then reply done.",), ("Bash(echo:*)",))]


SCENARIOS = (
    Scenario("s01-prompt-bash", ("prompt",), _prompt_bash),
    Scenario("s02-file-read", ("content",), _read_asks, _read_setup),
    Scenario("s03-file-write-edit", ("write", "edit"), _write_asks),
    Scenario("s04-file-path", ("path",), _path_asks, _path_setup),
    Scenario("s05-tool-error", ("ls", "read"), _error_asks),
    Scenario("s06-subagent", ("agent",), _agent_asks),
    Scenario("s07-long-output", ("long",), _long_asks, _long_setup),
    Scenario("s08-cmd-skill-args", ("cmdarg", "skillarg"), _cmd_asks, _cmd_setup),
    Scenario("s09-compact-stop", ("remember", "compact"), _compact_asks),
    Scenario(
        "s10-config-path-error", ("cfgpath", "settings_env", "managed"), _cfg_asks, _cfg_setup,
        by_design=("managed",), fail_first=True,
    ),  # fmt: skip
    Scenario("s11-synthetic-stdin", ("syn_prompt", "syn_path", "syn_nested", "syn_transcript"),
             lambda root, s: [], synthetic=True),  # fmt: skip
    Scenario("pc-leaky-contract", ("pc",), _pc_asks, by_design=("pc",), leaky_contract=True),
)
