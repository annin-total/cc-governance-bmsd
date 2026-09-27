"""1 シナリオを 1 つの隔離ルートで動かす（導入 → 実セッション → 送信の flush）。"""

import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

REPO = Path("/Users/terasawayuki/Documents/program/Development/bmsd-governance/work/wt-c")
sys.path.insert(0, str(REPO / "e2e"))

from _flow import ask, data_dir, ingest_config, install, install_path, session  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import PLUGIN_SRC, version  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402
from _server import BASE_PATH  # noqa: E402

_CONTRACT = "hooks/contract.py"
_LEAKY_FIELDS = (
    '    ("leak_prompt", ("prompt",), "VARCHAR(255)"),\n'
    '    ("leak_command", ("tool_input", "command"), "VARCHAR(255)"),\n'
    '    ("leak_stdout", ("tool_response", "stdout"), "VARCHAR(255)"),\n'
)
MODEL = "haiku"


def new_sentinels(labels) -> dict:
    return {k: f"SENTINEL-{uuid.uuid4().hex}" for k in labels}


def _overrides(sc, recorder, server) -> dict:
    over = ingest_config(server.port, server.token)
    cfg = json.loads(over["config.json"])
    cfg["ingest_url"] = recorder.url(sc.name, f"{BASE_PATH}/ingest")
    over["config.json"] = json.dumps(cfg).encode()
    if sc.leaky_contract:
        src = (PLUGIN_SRC / _CONTRACT).read_text(encoding="utf-8")
        head = "HOOK_FIELDS = (\n"
        assert src.count(head) == 1
        over[_CONTRACT] = src.replace(head, head + _LEAKY_FIELDS).encode()
    return over


def _synthetic(root, s) -> list:
    """インストール済みの collect.py を直接起動する（合成入力。実物の経路の補助）。"""
    hooks = install_path(root) / "hooks"
    env = root.env()
    env.update(CLAUDE_PLUGIN_DATA=str(data_dir(root)), CLAUDE_PLUGIN_ROOT=str(install_path(root)))
    transcript = root.tmp / "syn-transcript.jsonl"
    line = {"message": {"usage": {"input_tokens": 7}, "content": s["syn_transcript"]}}
    transcript.write_text(json.dumps(line) + "\n", encoding="utf-8")
    base = {"session_id": "syn", "cwd": f"/x/{s['syn_path']}", "permission_mode": "default"}
    inputs = [
        ("UserPromptSubmit", {**base, "prompt": s["syn_prompt"], "transcript_path": f"/n/{s['syn_path']}.jsonl",
                              "tool_input": {"command": s["syn_prompt"], "file_path": s["syn_path"]},
                              "extra": {"nested": [s["syn_prompt"]]}}),
        ("Stop", {**base, "transcript_path": str(transcript), "last_assistant_message": s["syn_prompt"]}),
        ("PostToolUse", None),
    ]  # fmt: skip
    codes = []
    for event, obj in inputs:
        text = json.dumps(obj) if obj else "[" * 200000 + json.dumps(s["syn_nested"]) + "]" * 200000
        res = subprocess.run(
            ["python3", str(hooks / "collect.py"), event], input=text, env=env,
            capture_output=True, text=True, timeout=30, cwd=root.project,
        )  # fmt: skip
        codes.append((event, res.returncode, len(res.stdout), len(res.stderr)))
    return codes


def run(sc, recorder, server, log) -> dict:
    """隔離ルートは消さずに返す（走査の後で呼び出し側が片付ける）。"""
    s = new_sentinels(sc.sentinels)
    root = E2ERoot()
    gitsrv = GitHttpServer(root.srv)
    out = {"name": sc.name, "root": root, "gitsrv": gitsrv, "s": s, "ok": False}
    try:
        sc.setup(root, s)
        install(root, gitsrv, version(1), _overrides(sc, recorder, server))
        for args, tools in sc.asks(root, s):
            ask(root, *args, model=MODEL, tools=tools)
        if sc.synthetic:
            session(root)
            root.wait_quiet()
            out["synthetic_codes"] = _synthetic(root, s)
        root.wait_quiet()
        data = data_dir(root)
        rows = hook_rows(data)
        out["rows"] = rows
        out["preflush"] = {str(p.relative_to(root.path)): p.read_bytes() for p in data.rglob("*") if p.is_file()}
        sent_at = data / "sent_at"
        if sent_at.exists():
            sent_at.unlink()
        session(root)
        root.wait_quiet()
        # fail_first では 500 の後に error 行が queue に残る。もう一度送る
        if sc.fail_first:
            (data / "sent_at").unlink(missing_ok=True)
            session(root)
            root.wait_quiet()
        out["rows_final"] = hook_rows(data)
        out["undelivered"] = [str(p.name) for p in (data / "spool").glob("*.jsonl")] + (
            ["queue.jsonl"] if (data / "queue.jsonl").exists() else []
        )
        out["ok"] = True
    except Exception as e:  # noqa: BLE001 (1 シナリオの失敗で全体を止めない。報告に残す)
        out["error"] = f"{type(e).__name__}: {str(e)[-1500:]}"
    log(f"{sc.name}: ok={out['ok']}")
    return out


def cleanup(out) -> None:
    out["gitsrv"].close()
    if os.environ.get("CC_E2E_KEEP") != "1":
        out["root"].cleanup()
