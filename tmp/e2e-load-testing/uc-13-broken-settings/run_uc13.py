"""UC 13: 壊れた settings.json の観測（一時スクリプト）。

使い方: CC_E2E_RUN=a .venv/bin/python run_uc13.py <出力 JSON> [ケース名 ...]
隔離ルートに 1 回導入し、ケースごとに状態を戻して claude -p（未ログイン）と hook の直接起動を行う。
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "e2e"))

_orig_mkdtemp = tempfile.mkdtemp
tempfile.mkdtemp = lambda prefix=None, **kw: _orig_mkdtemp(prefix="cc-e2e-a-13-", **kw)

from _flow import data_dir, install  # noqa: E402
from _githttp import GitHttpServer  # noqa: E402
from _market import version  # noqa: E402
from _root import E2ERoot, hook_rows  # noqa: E402

import cases  # noqa: E402

HOOK_TIMEOUT = 30


def sha(p: Path):
    try:
        return hashlib.sha256(p.read_bytes()).hexdigest()[:16]
    except OSError as e:
        return f"<{type(e).__name__}>"


def flags(p: Path) -> str:
    r = subprocess.run(["ls", "-lOd", str(p)], capture_output=True, text=True)
    return r.stdout.strip().split(" /")[0]


def state(root) -> dict:
    s = root.config / "settings.json"
    out = {"islink": s.is_symlink(), "exists": s.exists(), "sha": sha(s)}
    if s.is_symlink():
        out["link"] = os.readlink(s)
    if s.exists():
        st = s.stat()
        out.update(size=st.st_size, mode=oct(st.st_mode & 0o7777), ino=st.st_ino,
                   ls=flags(s))
    tgt = root.tmp / "target" / "settings.json"
    if tgt.exists() or tgt.parent.exists():
        out["target_sha"] = sha(tgt)
        out["target_exists"] = tgt.exists()
    bdir = root.config / "governance" / "backups"
    out["backups"] = sorted((b.name, b.stat().st_size, sha(b)) for b in bdir.glob("*")) if bdir.is_dir() else []
    out["config_files"] = sorted(p.name for p in root.config.iterdir())
    return out


def rows(root) -> dict:
    try:
        d = data_dir(root)
    except (AssertionError, FileNotFoundError):
        return {"data_dir": None}
    rs = hook_rows(d)
    return {
        "policy": [(r["key_name"], r["apply_result"], r["prev_value"]) for r in rs if r["kind"] == "policy"],
        "error": [(r["stage"], r["error_type"]) for r in rs if r["kind"] == "error"],
        "event": [r.get("hook_event") for r in rs if r["kind"] == "event"],
    }


def reset(root, base: bytes, proj_enable: bool) -> None:
    root.wait_quiet()
    s = root.config / "settings.json"
    subprocess.run(["chflags", "-h", "nouchg", str(s)], capture_output=True)
    if s.is_symlink() or s.exists():
        if not s.is_symlink():
            os.chmod(s, 0o644)
        s.unlink()
    tdir = root.tmp / "target"
    if tdir.exists():
        for p in tdir.iterdir():
            p.unlink()
        tdir.rmdir()
    gov = root.config / "governance"
    for sub in ("backups",):
        if (gov / sub).is_dir():
            for p in (gov / sub).iterdir():
                p.unlink()
    (gov / "once.json").unlink(missing_ok=True)
    try:
        d = data_dir(root)
        (d / "queue.jsonl").unlink(missing_ok=True)
        if (d / "spool").is_dir():
            for p in (d / "spool").iterdir():
                p.unlink()
    except (AssertionError, FileNotFoundError):
        pass
    for rel, data in SNAP.items():
        (root.config / rel).write_bytes(data)
    pdir = root.project / ".claude"
    if proj_enable:
        pdir.mkdir(exist_ok=True)
        (pdir / "settings.json").write_text(json.dumps(
            {"enabledPlugins": {"governance@cc-marketplace-governance-bmsd": True}}))
    elif (pdir / "settings.json").exists():
        (pdir / "settings.json").unlink()
    s.parent.mkdir(exist_ok=True)


def run_claude(root) -> dict:
    t = time.monotonic()
    auth = os.environ.get("UC13_AUTH") == "1"
    model = ("--model", "haiku") if auth else ()
    res = root.run_claude("-p", "ok", *model, "--output-format", "stream-json", "--verbose",
                          "--include-hook-events", timeout=180, auth=auth)
    el = round(time.monotonic() - t, 2)
    hooks, other = [], []
    for line in res.stdout.splitlines():
        try:
            o = json.loads(line)
        except ValueError:
            other.append(line[:300])
            continue
        st = o.get("subtype", "")
        if "hook" in st:
            keep = {k: o.get(k) for k in ("subtype", "hook_event", "hook_name", "exit_code", "outcome")}
            for k in ("stdout", "stderr", "output"):
                if o.get(k):
                    keep[k] = str(o[k])[:400]
            hooks.append(keep)
        elif o.get("type") == "result":
            other.append({k: o.get(k) for k in ("subtype", "is_error", "result")})
        elif st == "init":
            other.append({"init_plugins": o.get("plugins")})
    return {"rc": res.returncode, "sec": el, "stderr": res.stderr[-1500:], "hooks": hooks,
            "other": other}


def install_path(root) -> Path:
    recs = root.json("plugins/installed_plugins.json")["plugins"]["governance@cc-marketplace-governance-bmsd"]
    return Path(recs[0]["installPath"])


PLUGIN_STATE = ("plugins/installed_plugins.json", "plugins/known_marketplaces.json")
SNAP: dict = {}


def run_hook(root) -> dict:
    ip = install_path(root)
    env = root.env()
    env.update(CLAUDE_PLUGIN_ROOT=str(ip), CLAUDE_PLUGIN_DATA=str(data_dir(root)))
    inp = json.dumps({"hook_event_name": "SessionStart", "session_id": "uc13", "source": "startup"})
    t = time.monotonic()
    r = subprocess.run(["python3", str(ip / "hooks" / "session_start.py"), "SessionStart"],
                       input=inp, capture_output=True, text=True, env=env,
                       cwd=root.project, timeout=HOOK_TIMEOUT)
    return {"rc": r.returncode, "sec": round(time.monotonic() - t, 2),
            "stderr": r.stderr[-800:], "stdout": r.stdout[:300]}


def one(root, base: bytes, name: str, fn, proj: bool, mode: str) -> dict:
    reset(root, base, proj)
    fn(root, base)
    before = state(root)
    if mode == "hook3":
        r = [run_hook(root) for _ in range(3)][-1]
    else:
        r = run_claude(root) if mode == "claude" else run_hook(root)
    root.wait_quiet()
    changed = [rel for rel, data in SNAP.items() if (root.config / rel).read_bytes() != data]
    return {"case": name, "proj_enable": proj, "mode": mode, "before": before, "plugin_state_changed": changed,
            "run": r, "after": state(root), "rows": rows(root)}


def main() -> None:
    out = Path(sys.argv[1])
    wanted = sys.argv[2:]
    root = E2ERoot()
    srv = GitHttpServer(root.srv)
    results = {"root": str(root.path), "cases": []}
    try:
        install(root, srv, version(1))
        base = (root.config / "settings.json").read_bytes()
        SNAP.update({rel: (root.config / rel).read_bytes() for rel in PLUGIN_STATE})
        results["base"] = json.loads(base)
        for name, fn, variants in cases.CASES:
            if wanted and name not in wanted:
                continue
            for proj in variants:
                for mode in os.environ.get("UC13_MODES", "claude,hook").split(","):
                    if mode == "hook" and not proj and False in variants and True in variants:
                        continue  # 直接起動は本体の設定を読まないので 1 回でよい
                    res = one(root, base, name, fn, proj, mode)
                    results["cases"].append(res)
                    print(json.dumps({"case": name, "proj": proj, "mode": mode,
                                      "rc": res["run"]["rc"], "sec": res["run"]["sec"]}),
                          flush=True)
            out.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    finally:
        srv.close()
        reset(root, b"", False)
        out.write_text(json.dumps(results, ensure_ascii=False, indent=1))
        root.cleanup()


if __name__ == "__main__":
    main()
