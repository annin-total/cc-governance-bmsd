#!/usr/bin/env python3
"""隔離 HOME で Claude Code の対話セッションを pty 上に起動し、指定秒だけ保持する。

argv: home_name(a/b等) secs logpath [KEY=VALUE ...]
作業ディレクトリ（このスクリプトと同じ場所）に home-<home_name>/proj/ が
あらかじめ用意されている前提。home-*/ は実行のたびに作る作業データなので、
このリポジトリには含まれない（自分で用意する）。
"""

import fcntl
import os
import pty
import select
import shutil
import signal
import struct
import sys
import termios
import time

home_name, secs, logpath = sys.argv[1], float(sys.argv[2]), sys.argv[3]
W = os.path.dirname(os.path.abspath(__file__))
H = os.path.join(W, f"home-{home_name}")
CLAUDE_BIN = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")

drop = [
    "CLAUDECODE",
    "CLAUDE_CODE_SSE_PORT",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_BRIDGE_SESSION_ID",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
    "AI_AGENT",
    "FORCE_AUTOUPDATE_PLUGINS",
    "DISABLE_AUTOUPDATER",
]
env = {k: v for k, v in os.environ.items() if k not in drop}
env["HOME"] = H
env["TERM"] = "xterm-256color"
for extra in sys.argv[4:]:
    k, _, v = extra.partition("=")
    env[k] = v

pid, fd = pty.fork()
if pid == 0:
    os.chdir(os.path.join(H, "proj"))
    os.environ.clear()
    os.environ.update(env)
    os.execv(CLAUDE_BIN, ["claude"])

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 160, 0, 0))
deadline = time.time() + secs
with open(logpath, "wb") as log:
    while time.time() < deadline:
        r, _, _ = select.select([fd], [], [], 1.0)
        if r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                break
            log.write(data)
            log.flush()
        if os.waitpid(pid, os.WNOHANG)[0] == pid:
            log.write(b"\n[child exited early]\n")
            break
    else:
        os.kill(pid, signal.SIGTERM)
        time.sleep(2)
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
print("done")
