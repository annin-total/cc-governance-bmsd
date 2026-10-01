"""scan サブコマンド: 調書・作業ファイルの漏洩検査と伏せ字化。"""

from __future__ import annotations

import argparse
import getpass
import os
import re
import shutil
import socket
import tempfile
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

from _common import ArgError, DEFAULT_MAX_LINE_BYTES, inc, iter_lines, skill_files, unescape, write_json

SCAN_SCHEMA_VERSION = "1.0"
REDACTED = "［伏せ字］"

BUILTIN_TOOLS = {
    "read", "write", "edit", "multiedit", "bash", "glob", "grep", "task", "agent", "webfetch",
    "websearch", "todowrite", "notebookedit", "skill", "toolsearch", "askuserquestion",
    "exitplanmode", "killshell", "bashoutput", "slashcommand", "ls",
}
STOP_WORDS = {
    "home", "users", "user", "src", "usr", "var", "tmp", "opt", "mnt", "root", "documents",
    "desktop", "downloads", "work", "workspace", "projects", "repos", "code", "dev", "git",
    "lib", "bin", "app", "apps", "c:", "d:", "volumes", "private", "onedrive", "appdata",
    "local", "roaming", "temp", "github", "claude", ".claude",
}
SCAN_PATTERNS: List[Tuple[str, "re.Pattern[str]", bool]] = [
    ("aws_access_key", re.compile(r"(?:AKIA|ASIA)[0-9A-Z]{16}"), True),
    ("api_key_like", re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_\-]{10,}"), True),
    ("github_token", re.compile(r"(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"), True),
    ("slack_token", re.compile(r"xox[abposr]-[A-Za-z0-9\-]{10,}"), True),
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), True),
    ("arn", re.compile(r"arn:aws[a-z\-]*:[A-Za-z0-9\-]*:[^\s`'\")]*"), True),
    ("url", re.compile(r"(?:https?|ftp|file)://[^\s`'\")<>]+"), True),
    ("email", re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"), True),
    ("digits_12", re.compile(r"(?<![0-9])[0-9]{12}(?![0-9])"), True),
    ("path_windows", re.compile(
        r"(?<![A-Za-z0-9])[A-Za-z]:\\[^\s`'\"<>|]+|(?<![A-Za-z0-9])[A-Za-z]:/(?!/)[^\s`'\"<>|]+"
        r"|\\\\[A-Za-z0-9._\-]+\\[^\s`'\"<>|]+"), True),
    ("path_home", re.compile(r"(?<![\w])~[/\\][^\s`'\"<>|)]*"), True),
    ("path_unix", re.compile(
        r"(?<![\w/.:~\-])(?:/(?=[^/\s]*[A-Za-z])[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-/]+"
        r"|/(?:Users|home|mnt|var|tmp|opt|etc)(?![A-Za-z0-9_\-]))"), True),
    ("backtick_command", re.compile(r"`(?=[^`\n]*(?:\s|--|\||&&|;|\$\())[^`\n]{2,200}`"), True),
    ("unfilled_placeholder", re.compile(r"＜[^＞\n]{0,80}＞"), False),
]


def _forbidden_from_config(config_dir: str) -> Set[str]:
    words: Set[str] = set()
    re_cwd = re.compile(r'"cwd"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"')
    re_skill = re.compile(r'"skill"\s*:\s*"([^"\\]{2,100})"')
    re_attr = re.compile(r'"attributionSkill"\s*:\s*"([^"\\]{2,100})"')
    re_mcp = re.compile(r"mcp__([A-Za-z0-9_\-]+?)__")
    for dirpath, _dirs, files in os.walk(os.path.join(config_dir, "projects")):
        for name in files:
            if not name.endswith(".jsonl"):
                continue
            try:
                for _n, body in iter_lines(os.path.join(dirpath, name), DEFAULT_MAX_LINE_BYTES):
                    if body is None:
                        continue
                    text = body.decode("utf-8", errors="replace")
                    for raw in set(re_cwd.findall(text)):
                        cwd = unescape(raw)
                        parts = [p for p in re.split(r"[\\/]+", cwd) if p]
                        words.update(p for p in parts if len(p) >= 2 and p.lower() not in STOP_WORDS)
                    for rx in (re_skill, re_attr, re_mcp):
                        words.update(w for w in rx.findall(text) if len(w) >= 3)
            except OSError:
                continue
    for p in skill_files(os.path.join(config_dir, "skills"), False):
        words.add(os.path.basename(os.path.dirname(p)))
    return words


def build_forbidden(config_dir: Optional[str], subject: Optional[str]) -> List["re.Pattern[str]"]:
    words: Set[str] = set()
    if config_dir and os.path.isdir(config_dir):
        words |= _forbidden_from_config(config_dir)
    for getter in (getpass.getuser, socket.gethostname):
        try:
            v = getter()
        except Exception:  # noqa: BLE001 - 取れなければ使わない
            continue
        if v:
            words.add(v)
            words.add(v.split(".")[0])
    if subject:
        words.discard(subject)
    words = {w for w in words if len(w) >= 2 and w.lower() not in BUILTIN_TOOLS and w.lower() not in STOP_WORDS}
    pats = []
    for w in sorted(words, key=len, reverse=True):
        pats.append(re.compile(r"(?<![A-Za-z0-9_])" + re.escape(w) + r"(?![A-Za-z0-9_])", re.I))
    return pats


def _scan_files(targets: List[str], skip: Set[str]) -> Iterator[Tuple[str, str]]:
    for t in targets:
        t_abs = os.path.abspath(t)
        if os.path.isfile(t_abs):
            if t_abs not in skip:
                yield t_abs, os.path.basename(t_abs)
            continue
        for dirpath, dirs, files in os.walk(t_abs):
            dirs.sort()
            for name in sorted(files):
                p = os.path.join(dirpath, name)
                if p not in skip:
                    yield p, os.path.relpath(p, t_abs).replace(os.sep, "/")


def scan_line(line: str, forbidden: List["re.Pattern[str]"]) -> Tuple[Dict[str, int], List[Tuple[int, int]]]:
    """1 行の違反の種類別件数と、伏せ字にする範囲を返す。"""
    counts: Dict[str, int] = {}
    spans: List[Tuple[int, int]] = []
    for kind, rx, redact in SCAN_PATTERNS:
        for m in rx.finditer(line):
            if kind == "backtick_command" and m.group(0) == "`" + REDACTED + "`":
                continue
            inc(counts, kind)
            if redact:
                spans.append((m.start(), m.end()))
    for rx in forbidden:
        for m in rx.finditer(line):
            inc(counts, "forbidden_word")
            spans.append((m.start(), m.end()))
    return counts, spans


def _apply_redaction(line: str, spans: List[Tuple[int, int]]) -> str:
    merged: List[List[int]] = []
    for s, e in sorted(spans):
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    out = []
    pos = 0
    for s, e in merged:
        out.append(line[pos:s])
        out.append(REDACTED)
        pos = e
    out.append(line[pos:])
    return "".join(out)


def _write_atomic(path: str, text: str) -> None:
    """同じフォルダの一時ファイルに書いてから置き換える。途中で失敗しても元のファイルは壊れない。"""
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", prefix=".redact-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        shutil.copymode(path, tmp)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def cmd_scan(args: argparse.Namespace) -> int:
    for t in args.targets:
        if not os.path.exists(t):
            raise ArgError("target not found")
    forbidden = build_forbidden(os.path.expanduser(args.config_dir) if args.config_dir else None, args.subject_name)
    result: Dict[str, Any] = {"schema_version": SCAN_SCHEMA_VERSION, "files_scanned": 0, "files_skipped_binary": 0,
                              "files_unreadable": 0, "total_hits": 0, "by_kind": {}, "violations": [],
                              "redact": bool(args.redact), "redacted_hits": 0,
                              "note": "matched strings are never written; unfilled placeholders are reported only"}
    masked = 0
    for path, shown in _scan_files(args.targets, {os.path.abspath(args.out)}):
        try:
            with open(path, "rb") as f:
                raw = f.read()
        except OSError:
            result["files_unreadable"] += 1
            continue
        if b"\x00" in raw:
            result["files_skipped_binary"] += 1
            continue
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")
            decodable = False
        else:
            decodable = True
        result["files_scanned"] += 1
        if scan_line(shown, forbidden)[0]:
            masked += 1
            shown = "file-%d" % masked
        lines = text.splitlines(keepends=True)
        changed = False
        for i, line in enumerate(lines):
            counts, spans = scan_line(line, forbidden)
            for kind, n in sorted(counts.items()):
                result["violations"].append({"kind": kind, "file": shown, "line": i + 1, "count": n})
                result["total_hits"] += n
                inc(result["by_kind"], kind, n)
            if args.redact and spans and decodable:
                lines[i] = _apply_redaction(line, spans)
                result["redacted_hits"] += len(spans)
                changed = True
        if changed:
            _write_atomic(path, "".join(lines))
    write_json(args.out, result)
    print("scan ok: files=%d hits=%d redacted=%d" % (result["files_scanned"], result["total_hits"],
                                                     result["redacted_hits"]))
    return 0
