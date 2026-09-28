"""`seed_dashboard.py` の、列名から合成値の作り方への対応表。"""

import random
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Callable, Optional

from ccgov.constants import EFFECT_PROVIDER
from ccgov.vendor import contract, policy

TOOL_HOOKS = ("PostToolUse", "PostToolUseFailure")
TRANSCRIPT_HOOKS = ("PreCompact", "Stop")
EFFORT_HOOKS = ("PostToolUse", "PostToolUseFailure", "Stop")
TOOLS = ("Read", "Edit", "Bash", "Grep", "Skill", "Task")
SKILLS = ("brainstorming", "systematic-debugging", "governance:reapply")
# 実測の command_source は userSettings と plugin だけ。同梱のコマンドは `governance:名前`
COMMANDS = (
    ("governance:reapply", "plugin"),
    ("review", "userSettings"),
    ("deploy", "userSettings"),
)
PROVIDERS = (EFFECT_PROVIDER,) * 4 + ("google-vertex",)
MODELS = ("claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5")
# 準拠前のほうが長い文脈で圧縮に入る（/effect の前後差が見えるように）
CONTEXT_MAX = {"before": 180_000, "after": 120_000}
_EPOCH = date(1970, 1, 1)


@dataclass(frozen=True)
class Term:
    """1 台の端末。`off_keys` の施策は一度も準拠しない（prev_value がキー無しのまま）。"""

    user: str
    host: str
    plugin_version: str
    claude_code_version: str
    install: int
    start: int
    stop: int
    off_keys: frozenset


@dataclass
class Ctx:
    """1 行を作るときの材料。"""

    rng: random.Random
    user: str
    ts: int = 0
    day: int = 0
    term: Optional[Term] = None
    hook: Optional[str] = None
    session: Optional[str] = None
    key: Optional[str] = None
    error: Optional[tuple] = None
    factor: float = 1.0
    tool: Optional[str] = field(init=False, default=None)
    command: Optional[tuple] = field(init=False, default=None)

    def __post_init__(self) -> None:
        if self.ts:
            self.day = contract.to_day(self.ts)
        if self.hook in TOOL_HOOKS:
            self.tool = self.rng.choice(TOOLS)
        if self.hook == "UserPromptExpansion":
            self.command = self.rng.choice(COMMANDS)

    @property
    def compliant(self) -> bool:
        return self.key not in self.term.off_keys and self.day >= self.term.start


def _uuid(c: Ctx) -> str:
    return str(uuid.UUID(int=c.rng.getrandbits(128)))


def _pick(c: Ctx, hooks: tuple, values: tuple) -> Any:
    return c.rng.choice(values) if c.hook in hooks else None


def _context_tokens(c: Ctx) -> Optional[int]:
    if c.hook not in TRANSCRIPT_HOOKS:
        return None
    return c.rng.randint(
        10_000, CONTEXT_MAX["before" if c.day < c.term.start else "after"]
    )


def _expected(c: Ctx) -> Optional[str]:
    return contract.policy_text(policy.SET[c.key])


_COMMON: dict = {
    "event_id": _uuid,
    "ts": lambda c: c.ts,
    "day": lambda c: c.day,
    "user_email": lambda c: c.user,
    "host": lambda c: c.term.host,
}

EVENT_RULES: dict = {
    **_COMMON,
    "hook_event": lambda c: c.hook,
    "context_tokens": _context_tokens,
    "claude_code_version": lambda c: (
        c.term.claude_code_version if c.hook in TRANSCRIPT_HOOKS else None
    ),
    "session_id": lambda c: c.session,
    "prompt_id": lambda c: None if c.hook == "SessionStart" else _uuid(c),
    "tool_name": lambda c: c.tool,
    "source": lambda c: _pick(
        c, ("SessionStart",), ("startup", "resume", "clear", "compact")
    ),
    "compact_trigger": lambda c: _pick(c, ("PreCompact",), ("auto", "manual")),
    "command_name": lambda c: c.command[0] if c.command else None,
    "command_source": lambda c: c.command[1] if c.command else None,
    "skill_name": lambda c: c.rng.choice(SKILLS) if c.tool == "Skill" else None,
    "effort_level": lambda c: _pick(c, EFFORT_HOOKS, ("low", "medium", "high")),
    "permission_mode": lambda c: c.rng.choice(
        ("default", "acceptEdits", "plan", "bypassPermissions")
    ),
    "agent_id": lambda c: _uuid(c) if c.tool and c.rng.random() < 0.15 else None,
    "is_interrupt": lambda c: (
        c.rng.random() < 0.3 if c.hook == "PostToolUseFailure" else None
    ),
}

POLICY_RULES: dict = {
    **_COMMON,
    "key_name": lambda c: c.key,
    "value": _expected,
    "prev_value": lambda c: _expected(c) if c.compliant else None,
    "apply_result": lambda c: "already_ok" if c.compliant else "applied",
    "plugin_version": lambda c: c.term.plugin_version,
}

ERROR_RULES: dict = {
    **_COMMON,
    "hook_event": lambda c: c.error[2],
    "plugin_version": lambda c: c.term.plugin_version,
    "stage": lambda c: c.error[0],
    "error_type": lambda c: c.error[1],
}


def _tokens(c: Ctx, high: int) -> int:
    return int(c.rng.randint(high // 10, high) * c.factor)


# CSV のヘッダ名で引く。ヘッダ順に書き出す
CSV_RULES: dict = {
    "Date": lambda c: (_EPOCH + timedelta(days=c.day)).isoformat(),
    "User Email": lambda c: c.user,
    "Provider": lambda c: c.rng.choice(PROVIDERS),
    "Model": lambda c: c.rng.choice(MODELS),
    "Currency": lambda c: "USD",
    "Cost": lambda c: round(c.rng.uniform(1, 20) * c.factor, 2),
    "Input Tokens": lambda c: _tokens(c, 400_000),
    "Output Tokens": lambda c: _tokens(c, 60_000),
    "Cache Read Tokens": lambda c: _tokens(c, 2_000_000),
    "Cache Write Tokens": lambda c: _tokens(c, 300_000),
    "Cached Input Tokens": lambda c: _tokens(c, 2_000_000),
    "Uncached Input Tokens": lambda c: _tokens(c, 400_000),
}

RULES: dict[str, dict[str, Callable[[Ctx], Any]]] = {
    "event": EVENT_RULES,
    "policy": POLICY_RULES,
    "error": ERROR_RULES,
    "csv": CSV_RULES,
}
