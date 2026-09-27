"""UC 24 段階 2・3: 実物の claude -p で、hook に渡る CLAUDE_CODE_ENTRYPOINT と既読・ブラウザの扱いを見る。

段階 2 は url の無いお知らせで、hook から見た `open` が偽であることを確かめる（本物が呼ばれない条件）。
段階 3 で url 付きに差し替え、起動の形と継承した入口の変数を振る。
使い方: CC_E2E_RUN=a <worktree>/.venv/bin/python real.py [--auth]
"""

import json
import sys

import uc24_lib as L

import _root
from _flow import data_dir, install, install_path
from _githttp import GitHttpServer
from _market import version
from _root import E2ERoot

_root._EXTRA_KEYS = (*_root._EXTRA_KEYS, "PATH", "CLAUDE_CODE_ENTRYPOINT")
P_TEXT = ("-p", "ok")
P_STREAM = ("-p", "ok", "--output-format", "stream-json", "--verbose")
P_SDK = ("-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose")
UNSET = object()
RESULTS: list = []


def _add_probe(r: E2ERoot) -> None:
    p = r.config / "settings.json"
    s = json.loads(p.read_text(encoding="utf-8"))
    cmd = f'python3 "{L.PROBE}"'
    s["hooks"] = {"SessionStart": [{"hooks": [{"type": "command", "command": cmd}]}]}
    p.write_text(json.dumps(s, indent=2), encoding="utf-8")


def _messages(stdout: str) -> list:
    out = []
    for line in stdout.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("subtype") == "hook_response" and e.get("hook_event") == "SessionStart":
            out.append("UC24" in (e.get("output") or ""))
    return out


def _case(r: E2ERoot, label: str, args: tuple, ep=UNSET, auth: bool = False, runs: int = 1):
    seen = (r.config / "plugins" / "data")
    for f in seen.glob("*/seen.json"):
        f.unlink()
    L.reset_logs()
    extra = {"PATH": L.fake_path()}
    if ep is not UNSET:
        extra["CLAUDE_CODE_ENTRYPOINT"] = ep
    if auth:
        args = (*args, "--model", "haiku")
    rcs, hook_outputs = [], []
    for _ in range(runs):
        res = r.run_claude(*args, timeout=180, extra_env=extra, auth=auth)
        r.wait_quiet()
        rcs.append(res.returncode)
        hook_outputs.append(_messages(res.stdout))
    sj = data_dir(r) / "seen.json"
    probes = [json.loads(x) for x in L.read_lines(L.PROBE_LOG)]
    rec = {
        "label": label, "args": " ".join(args), "inherited_ep": None if ep is UNSET else ep,
        "rc": rcs, "hook_saw_ep": [p["entrypoint"] for p in probes],
        "which_open": sorted({str(p["which_open"]) for p in probes}),
        "hook_response_has_systemMessage": hook_outputs,
        "seen": json.loads(sj.read_text()) if sj.exists() else None,
        "open_calls": L.read_lines(L.OPEN_LOG),
    }  # fmt: skip
    RESULTS.append({**rec, "probe_detail": probes[:1]})
    print(json.dumps(rec, ensure_ascii=False), flush=True)
    return rec


def _mutate(p) -> None:
    """判定がゲートするかの確認用。非対話の早期 return を消し、対話判定を常に真にする。"""
    src = p.read_text(encoding="utf-8")
    new = src.replace("    if _browser.is_headless():\n        return\n", "")
    new = new.replace("if _browser.is_interactive():", "if True:")
    assert new.count("if True:") == 1 and "is_headless" not in new, "変異が当たらない"
    p.write_text(new, encoding="utf-8")


def main() -> None:
    auth = "--auth" in sys.argv
    L.setup_fakes()
    r = E2ERoot()
    srv = GitHttpServer(r.srv)
    try:
        install(r, srv, version(1), {"notices.json": L.notices(with_url=False)})
        _add_probe(r)
        # 段階 2: url 無し。親から cli を継承させても hook の open が偽を指すか
        for ep in ("cli", UNSET):
            rec = _case(r, f"safety-{ep if ep is not UNSET else 'unset'}", P_STREAM, ep)
            fake = str(L.FAKEBIN / "open")
            if rec["which_open"] != [fake]:
                raise SystemExit(f"hook から見た open が偽でない: {rec['which_open']}")
        (install_path(r) / "notices.json").write_bytes(L.notices(with_url=True))
        # 段階 3
        if "--mutant" in sys.argv:
            _mutate(install_path(r) / "hooks" / "session_start.py")
            _case(r, "mutant-p-stream", P_STREAM)
        elif auth:
            _case(r, "auth-p-text", P_TEXT, auth=True)
            _case(r, "auth-p-text-inherit-cli", P_TEXT, "cli", auth=True)
        else:
            _case(r, "p-text", P_TEXT)
            _case(r, "p-stream-x2", P_STREAM, runs=2)
            _case(r, "p-sdk-stdin", P_SDK)
            _case(r, "p-sdk-stdin-sdk-py", P_SDK, "sdk-py")
            for ep in ("cli", "sdk-ts", "sdk-py", "claude-vscode", "foo", ""):
                _case(r, f"inherit-{ep or 'empty'}", P_STREAM, ep)
        name = "real-mutant.json" if "--mutant" in sys.argv else "real-auth.json" if auth else "real.json"
        out = L.WT.parent.parent / (
            f"product/cc-governance-bmsd/.local/e2e-load-testing/uc-24-noninteractive-notices/{name}"
        )
        out.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1), encoding="utf-8")
    finally:
        srv.close()
        r.cleanup()
        L.cleanup()


if __name__ == "__main__":
    main()
