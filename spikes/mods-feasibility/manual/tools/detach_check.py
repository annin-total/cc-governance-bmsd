"""切り離した子プロセスが Claude Code の終了後も生き残るかを確かめる。

使い方: python detach_check.py run [--interactive] [--keep] [--claude claude]
  claude を --plugin-dir（feas-field）と一時の --settings（SessionEnd hook）で起動し、
  mod の /feas-field detach と SessionEnd hook から子を起動させる。claude の終了後に、
  子は claude の終了の印（exited）が置かれるまで待ってから完了の印を書く。完了の印が書けたかを表にする。モデルは呼ばない。
内部用: launch <method> <dir> <name> / sleep <name> <dir>
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN_DIR = HERE.parent / "feas-field"
IS_WINDOWS = os.name == "nt"
POSIX_NAMES = ["hook:popen", "mod-py:popen", "mod-py:nohup", "mod:sh-nohup"]
WINDOWS_NAMES = [
    "hook:popen",
    "mod-py:popen",
    "mod-py:breakaway",
    "mod-py:cmd-start",
    "mod-py:start-process",
    "mod-py:wmi",
    "mod:start-process",
]
# 親の Claude Code から継承すると子の claude が別物として動く変数
INHERITED = [
    "CLAUDE_CODE_SSE_PORT",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_BRIDGE_SESSION_ID",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDECODE",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
]
DEVNULL = {
    "stdin": subprocess.DEVNULL,
    "stdout": subprocess.DEVNULL,
    "stderr": subprocess.DEVNULL,
}
AFTER_EXIT_SEC = 3
CHILD_MAX_WAIT_SEC = 600
REPORT_WAIT_SEC = 20


def _slash(p: object) -> str:
    """hook のコマンドはシェル（Git Bash・cmd）を通るので、Windows でも / 区切りにする。"""
    return str(p).replace("\\", "/")


def _mark(d: Path, name: str, kind: str, data: dict[str, object]) -> None:
    (d / f"{name.replace(':', '_')}.{kind}.json").write_text(
        json.dumps(data), encoding="utf-8"
    )


def _ps(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def _launch(method: str, d: Path, name: str) -> None:
    argv = [sys.executable, str(Path(__file__).resolve()), "sleep", name, str(d)]
    if method == "popen":  # 今の _sender.launch() と同じ起動
        subprocess.Popen(argv, start_new_session=True, **DEVNULL)
    elif method == "nohup":
        subprocess.run(
            ["sh", "-c", 'nohup "$0" "$@" >/dev/null 2>&1 </dev/null &', *argv],
            check=True,
            **DEVNULL,
        )
    elif method == "breakaway":
        flags = (
            subprocess.DETACHED_PROCESS
            | subprocess.CREATE_NEW_PROCESS_GROUP
            | subprocess.CREATE_BREAKAWAY_FROM_JOB
        )
        subprocess.Popen(argv, creationflags=flags, **DEVNULL)
    elif method == "cmd-start":
        subprocess.run(
            'cmd /d /c start "feas" /b ' + subprocess.list2cmdline(argv),
            check=True,
            **DEVNULL,
        )
    elif method == "start-process":
        args = ",".join(_ps('"' + a + '"') for a in argv[1:])
        ps = (
            "Start-Process -WindowStyle Hidden -FilePath "
            + _ps(argv[0])
            + " -ArgumentList "
            + args
        )
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            check=True,
            **DEVNULL,
        )
    elif method == "wmi":
        ps = (
            "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="
            + _ps(subprocess.list2cmdline(argv))
            + "}; exit $r.ReturnValue"
        )
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            check=True,
            **DEVNULL,
        )
    else:
        raise ValueError(method)


def _sleep(name: str, d: Path) -> None:
    _mark(
        d, name, "start", {"t": time.time(), "pid": os.getpid(), "ppid": os.getppid()}
    )
    deadline = time.time() + CHILD_MAX_WAIT_SEC
    while not (d / "exited").exists() and time.time() < deadline:
        time.sleep(0.5)
    time.sleep(AFTER_EXIT_SEC)
    _mark(d, name, "done", {"t": time.time(), "sawExit": (d / "exited").exists()})


def _child_env(d: Path) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k not in INHERITED}
    env.update(
        FEAS_PY=_slash(sys.executable),
        FEAS_DETACH_SCRIPT=_slash(Path(__file__).resolve()),
        FEAS_DETACH_DIR=_slash(d),
    )
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def _write_settings(d: Path) -> Path:
    cmd = f'"{_slash(sys.executable)}" "{_slash(Path(__file__).resolve())}" launch popen "{_slash(d)}" hook:popen'
    path = d / "settings.json"
    path.write_text(
        json.dumps(
            {
                "hooks": {
                    "SessionEnd": [{"hooks": [{"type": "command", "command": cmd}]}]
                }
            }
        ),
        encoding="utf-8",
    )
    return path


def _mask_home(text: object) -> object:
    return text.replace(str(Path.home()), "~") if isinstance(text, str) else text


def _report(d: Path, t_exit: float) -> list[dict[str, object]]:
    rows = []
    for name in WINDOWS_NAMES if IS_WINDOWS else POSIX_NAMES:
        base = name.replace(":", "_")
        read = {
            k: json.loads((d / f"{base}.{k}.json").read_text(encoding="utf-8"))
            for k in ("start", "done", "error")
            if (d / f"{base}.{k}.json").exists()
        }
        done_t = read.get("done", {}).get("t")
        rows.append(
            {
                "name": name,
                "started": "start" in read,
                "survived": bool(
                    done_t and done_t > t_exit and read["done"].get("sawExit")
                ),
                "doneAfterExitSec": round(done_t - t_exit, 1) if done_t else None,
                "error": _mask_home(read.get("error", {}).get("error")),
            }
        )
    return rows


def _wait_done(d: Path, seconds: int) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        started = {p.name.split(".")[0] for p in d.glob("*.start.json")}
        done = {p.name.split(".")[0] for p in d.glob("*.done.json")}
        if started and started <= done:
            return
        time.sleep(1)


def _run(a: argparse.Namespace) -> int:
    d = Path(tempfile.mkdtemp(prefix="feas-detach-"))
    claude = shutil.which(a.claude) or a.claude
    cmd = [
        claude,
        "--plugin-dir",
        str(PLUGIN_DIR),
        "--settings",
        str(_write_settings(d)),
    ]
    if not a.interactive:
        cmd += ["-p", "/feas-field detach"]
    if a.keep:
        print("work dir:", d, flush=True)
    if a.interactive:
        print(
            "claude の中で /feas-field detach を実行し、続けて /exit で終了する",
            flush=True,
        )
        rc = subprocess.run(cmd, env=_child_env(d), check=False).returncode
    else:
        r = subprocess.run(
            cmd,
            env=_child_env(d),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        rc = r.returncode
        print(r.stdout.strip(), flush=True)
    t_exit = time.time()
    (d / "exited").write_text(str(t_exit), encoding="utf-8")
    print(f"claude exited rc={rc}; waiting up to {REPORT_WAIT_SEC}s", flush=True)
    _wait_done(d, REPORT_WAIT_SEC)
    print(
        json.dumps(
            {
                "os": os.name,
                "python": sys.version.split()[0],
                "results": _report(d, t_exit),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if not a.keep:
        shutil.rmtree(d)
    return 0


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    if len(sys.argv) >= 2 and sys.argv[1] in ("launch", "sleep"):
        if sys.argv[1] == "sleep":
            _sleep(sys.argv[2], Path(sys.argv[3]))
            return 0
        method, d, name = sys.argv[2], Path(sys.argv[3]), sys.argv[4]
        try:
            _launch(method, d, name)
        except Exception as e:  # noqa: BLE001 (失敗の種類を印に残して表に出す)
            _mark(d, name, "error", {"error": f"{type(e).__name__}: {e}"[:300]})
        return 0
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["run"])
    ap.add_argument("--interactive", action="store_true")
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--claude", default="claude")
    return _run(ap.parse_args())


if __name__ == "__main__":
    sys.exit(main())
