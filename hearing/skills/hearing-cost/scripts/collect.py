#!/usr/bin/env python3
"""hearing-cost の集計スクリプト。サブコマンド collect（履歴の集計）と scan（漏洩検査）を持つ。

Python 3.8 以上・標準ライブラリのみ。本文・パス・コマンド・cwd の生文字列は出力しない。
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import re
import socket
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

SCHEMA_VERSION = "1.0"
SCAN_SCHEMA_VERSION = "1.0"
DEFAULT_MAX_LINE_BYTES = 50_000_000
SESSION_GAP_SECONDS = 30 * 60
TOP_N = 5
DEFAULT_CLEANUP_DAYS = 30
RETENTION_NEAR_DAYS = 2
TOKEN_TYPES = ("input", "output", "cache_creation", "cache_read")
TOKEN_SUBTYPES = ("cache_creation_5m", "cache_creation_1h")
ALL_TOKEN_KEYS = TOKEN_TYPES + TOKEN_SUBTYPES
USAGE_FIELDS = {
    "input": "input_tokens",
    "output": "output_tokens",
    "cache_creation": "cache_creation_input_tokens",
    "cache_read": "cache_read_input_tokens",
}
CACHE_SUBFIELDS = {
    "cache_creation_5m": "ephemeral_5m_input_tokens",
    "cache_creation_1h": "ephemeral_1h_input_tokens",
}
MODEL_USAGE_FIELDS = {
    "input": "inputTokens",
    "output": "outputTokens",
    "cache_creation": "cacheCreationInputTokens",
    "cache_read": "cacheReadInputTokens",
}
FILE_TOOL_KEYS = ("file_path", "notebook_path")
RESULT_BUCKETS = ((1_000, "lt_1k"), (10_000, "1k_10k"), (50_000, "10k_50k"), (200_000, "50k_200k"))
RESULT_BUCKET_MAX = "ge_200k"
LENGTH_BUCKETS = ((10, "lt_10m"), (30, "10m_30m"), (60, "30m_1h"), (180, "1h_3h"), (480, "3h_8h"))
LENGTH_BUCKET_MAX = "ge_8h"
SKIP_MARKERS = (".orphaned", ".superseded")
SETTINGS_SCALAR_KEYS = {"effortLevel": "effort_level", "alwaysThinkingEnabled": "always_thinking_enabled"}
MODEL_ALIASES = ("default", "best", "opus", "sonnet", "haiku", "fable", "opusplan")
KNOWN_FAMILIES = ("opus", "sonnet", "haiku", "fable")
TOP_LINE_TYPES = {
    "user", "assistant", "system", "attachment", "summary", "cost-state", "queue-operation",
    "last-prompt", "ai-title", "atis-latch", "mode", "file-history-snapshot", "progress",
    "custom-title", "tag", "agent-name", "pr-link",
}
TOP_FIELDS = (
    "type", "timestamp", "sessionId", "agentId", "uuid", "cwd", "version",
    "isSidechain", "isMeta", "isCompactSummary", "message", "modelUsage",
)
REDACTED = "［伏せ字］"

RE_NAME = re.compile(r"^[A-Za-z0-9_:.@\-]{1,100}$")
RE_SHORT_VALUE = re.compile(r"^[A-Za-z0-9_.\-]{1,24}$")
RE_EXT = re.compile(r"^\.[a-z0-9]{1,10}$")
RE_TS = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$"
)
RE_ASSISTANT = re.compile(r'"type"\s*:\s*"assistant"')
RE_TOKEN = re.compile(r'"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:)?|[{}\[\]]')
RE_COMMAND = re.compile(r"<command-name>\s*/?([A-Za-z0-9_:.@\-]{1,100})\s*</command-name>")
RE_FAMILY = re.compile(r"(?<![a-z])(opus|sonnet|haiku|fable)(?![a-z])")
RE_NEW_FAMILY = re.compile(r"claude-([a-z]{2,20})-\d")
RE_ARN_MODEL = re.compile(r"(?<![a-z\-])(?:foundation-model|inference-profile)/([^/\s\"]+)")
RE_GEN_AFTER = r"{fam}-(\d{{1,2}})(?:-(\d{{1,2}}))?(?!\d)"
RE_GEN_BEFORE = r"claude-(\d{{1,2}})(?:[-.](\d{{1,2}}))?-{fam}"


class ArgError(Exception):
    """引数の誤り（終了コード 2）。"""


# ---------------------------------------------------------------- 共通の小物

def _int(v: Any) -> int:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return 0
    return max(int(v), 0)


def _label(prefix: str, raw: str) -> str:
    return prefix + "-" + hashlib.sha256(raw.encode("utf-8", "replace")).hexdigest()[:8]


def _safe_name(v: Any) -> Optional[str]:
    if isinstance(v, str) and RE_NAME.match(v):
        return v
    return None


def _short_value(v: Any) -> str:
    if isinstance(v, str) and RE_SHORT_VALUE.match(v):
        return v
    return "other"


def _inc(d: Dict[str, int], k: str, n: int = 1) -> None:
    d[k] = d.get(k, 0) + n


def _zero_tokens() -> Dict[str, int]:
    return {k: 0 for k in ALL_TOKEN_KEYS}


def _add_tokens(dst: Dict[str, int], src: Dict[str, int]) -> None:
    for k in ALL_TOKEN_KEYS:
        dst[k] = dst.get(k, 0) + src.get(k, 0)


def parse_ts(s: Any, naive_local: bool = False) -> Optional[float]:
    """ISO8601 を epoch 秒に。読めなければ None。"""
    if not isinstance(s, str):
        return None
    m = RE_TS.match(s.strip())
    if not m:
        return None
    y, mo, d, hh, mm, ss, frac, tz = m.groups()
    try:
        dt = datetime(int(y), int(mo), int(d), int(hh or 0), int(mm or 0), int(ss or 0),
                      int((frac or "0")[:6].ljust(6, "0")))
    except ValueError:
        return None
    if tz is None:
        dt = dt.astimezone() if naive_local else dt.replace(tzinfo=timezone.utc)
    elif tz == "Z":
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        sign = 1 if tz[0] == "+" else -1
        digits = tz[1:].replace(":", "")
        off = timedelta(hours=int(digits[:2]), minutes=int(digits[2:]))
        dt = dt.replace(tzinfo=timezone(sign * off))
    return dt.timestamp()


def iso(epoch: Optional[float]) -> Optional[str]:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _unescape(raw: str) -> str:
    if "\\" not in raw:
        return raw
    try:
        v = json.loads('"' + raw + '"')
        return v if isinstance(v, str) else ""
    except ValueError:
        return ""


def top_fields(line: str, wanted: Tuple[str, ...] = TOP_FIELDS) -> Tuple[Dict[str, Any], Dict[str, int]]:
    """JSON 行を全体パースせず、深さ 1 のキーの文字列値・真偽値と、値の開始位置を抜く。"""
    vals: Dict[str, Any] = {}
    offs: Dict[str, int] = {}
    depth = 0
    pending: Optional[str] = None
    for m in RE_TOKEN.finditer(line):
        tok = m.group(0)
        if tok in ("{", "["):
            if pending is not None:
                offs[pending] = m.start()
                pending = None
            depth += 1
            continue
        if tok in ("}", "]"):
            depth -= 1
            continue
        if m.group(2) and depth == 1:
            key = m.group(1)
            if key in wanted:
                rest = line[m.end():m.end() + 8].lstrip()
                if rest.startswith("true"):
                    vals[key] = True
                elif rest.startswith("false"):
                    vals[key] = False
                elif rest.startswith('"'):
                    pending = key
                elif rest[:1] in ("{", "["):
                    pending = key
            continue
        if pending is not None and not m.group(2):
            vals[pending] = _unescape(m.group(1))
            pending = None
    return vals, offs


def decode_at(line: str, off: int) -> Any:
    try:
        return json.JSONDecoder().raw_decode(line, off)[0]
    except (ValueError, IndexError):
        return None


def iter_lines(path: str, max_bytes: int) -> Iterator[Tuple[int, Optional[bytes]]]:
    """(行番号, 行バイト列) を返す。上限超えは None。改行は除く。"""
    with open(path, "rb") as f:
        n = 0
        while True:
            raw = f.readline(max_bytes + 2)
            if not raw:
                return
            n += 1
            if raw.endswith(b"\n"):
                body = raw.rstrip(b"\r\n")
            elif len(raw) < max_bytes + 2:
                body = raw.rstrip(b"\r")
            else:
                while True:
                    chunk = f.readline(1 << 20)
                    if not chunk or chunk.endswith(b"\n"):
                        break
                yield n, None
                continue
            if len(body) > max_bytes:
                yield n, None
                continue
            if n == 1 and body.startswith(b"\xef\xbb\xbf"):
                body = body[3:]
            yield n, body


# ---------------------------------------------------------------- モデル判別

def classify_model(model: Any) -> Dict[str, Optional[str]]:
    """モデル ID をバケット（ファミリー名/other_claude/non_claude/unknown）と世代に分ける。"""
    if not isinstance(model, str) or not model.strip():
        return {"bucket": "unknown", "family": None, "generation": None}
    s = model.strip().lower()
    if s.startswith("arn:"):
        m = RE_ARN_MODEL.search(s)
        if not m:
            return {"bucket": "unknown", "family": None, "generation": None}
        s = m.group(1)
    if "anthropic." not in s and "claude-" not in s:
        return {"bucket": "non_claude", "family": None, "generation": None}
    fam_m = RE_FAMILY.search(s)
    family = fam_m.group(1) if fam_m else None
    if family is None:
        nm = RE_NEW_FAMILY.search(s)
        if nm and nm.group(1) not in ("instant", "v"):
            family = nm.group(1)
    if family is None:
        return {"bucket": "other_claude", "family": None, "generation": None}
    return {"bucket": family, "family": family, "generation": _generation(s, family)}


def _generation(s: str, family: str) -> Optional[str]:
    fam = re.escape(family)
    m = re.search(RE_GEN_AFTER.format(fam=fam), s) or re.search(RE_GEN_BEFORE.format(fam=fam), s)
    if not m:
        return None
    return m.group(1) + ("-" + m.group(2) if m.group(2) else "")


# ---------------------------------------------------------------- 設定・導入済みスキル

def _load_json_file(path: str) -> Any:
    try:
        with open(path, "r", encoding="utf-8-sig", errors="replace") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def read_settings(config_dir: str) -> Dict[str, Any]:
    data = _load_json_file(os.path.join(config_dir, "settings.json"))
    out: Dict[str, Any] = {"found": isinstance(data, dict), "cleanup_period_days": None, "model": None,
                           "effort_level": None, "always_thinking_enabled": None,
                           "mcp_servers_count": None}
    if not isinstance(data, dict):
        return out
    cpd = data.get("cleanupPeriodDays")
    if isinstance(cpd, (int, float)) and not isinstance(cpd, bool):
        out["cleanup_period_days"] = int(cpd)
    model = data.get("model")
    if isinstance(model, str):
        alias = model.strip().lower().replace("[1m]", "")
        cls = classify_model(model)
        out["model"] = {"alias": alias if alias in MODEL_ALIASES else None,
                        "bucket": cls["bucket"], "generation": cls["generation"]}
    for key, name in SETTINGS_SCALAR_KEYS.items():
        v = data.get(key)
        if isinstance(v, bool):
            out[name] = v
        elif v is not None:
            out[name] = _short_value(v)
    mcp = data.get("mcpServers")
    if isinstance(mcp, dict):
        out["mcp_servers_count"] = len(mcp)
    return out


def _description_chars(text: str) -> int:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return 0
    body: List[str] = []
    for ln in lines[1:]:
        if ln.strip() == "---":
            break
        body.append(ln)
    for i, ln in enumerate(body):
        if not ln.startswith("description:"):
            continue
        val = ln[len("description:"):].strip()
        if val in ("", "|", ">", "|-", ">-"):
            parts = []
            for nxt in body[i + 1:]:
                if nxt.strip() and not nxt.startswith((" ", "\t")):
                    break
                parts.append(nxt.strip())
            val = " ".join(p for p in parts if p)
        return len(val.strip("\"'"))
    return 0


def _frontmatter_name(text: str) -> Optional[str]:
    m = re.search(r"^name:\s*[\"']?([A-Za-z0-9_:.\-]{1,100})", text, re.M)
    return m.group(1) if m else None


def _skill_files(root: str, recursive: bool) -> List[str]:
    found: List[str] = []
    if not os.path.isdir(root):
        return found
    if not recursive:
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name, "SKILL.md")
            if os.path.isfile(p):
                found.append(p)
        return found
    for dirpath, _dirs, files in os.walk(root):
        if "SKILL.md" in files and os.path.basename(os.path.dirname(dirpath)) == "skills":
            found.append(os.path.join(dirpath, "SKILL.md"))
    return sorted(found)


def _skill_stats(paths: List[str]) -> Dict[str, Any]:
    sizes: List[int] = []
    descs: List[int] = []
    for p in paths:
        try:
            sizes.append(os.path.getsize(p))
            with open(p, "r", encoding="utf-8", errors="replace") as f:
                descs.append(_description_chars(f.read(65536)))
        except OSError:
            continue
    return {"count": len(sizes), "skill_md_bytes_total": sum(sizes), "skill_md_bytes_max": max(sizes or [0]),
            "description_chars_total": sum(descs), "description_chars_max": max(descs or [0])}


def installed_skills(config_dir: str) -> Tuple[Dict[str, Any], Set[str]]:
    personal_root = os.path.join(config_dir, "skills")
    personal = _skill_files(personal_root, False)
    names: Set[str] = set()
    for p in personal:
        names.add(os.path.basename(os.path.dirname(p)))
        try:
            with open(p, "r", encoding="utf-8", errors="replace") as f:
                n = _frontmatter_name(f.read(65536))
            if n:
                names.add(n)
        except OSError:
            continue
    plugin = _skill_files(os.path.join(config_dir, "plugins"), True)
    info = {"personal": _skill_stats(personal), "plugin": _skill_stats(plugin),
            "note": "plugin counts may include cached copies; project skills are not read"}
    return info, names


def classify_skill(name: str, personal: Set[str]) -> str:
    if ":" in name:
        return "plugin"
    if name in personal:
        return "personal"
    return "builtin_or_unknown"


# ---------------------------------------------------------------- collect 本体

class Collector:
    """projects/ 配下の jsonl を読み、集計 JSON を作る。"""

    def __init__(self, config_dir: str, start: float, end: float, exclude: Optional[str],
                 max_bytes: int, local_tz: bool) -> None:
        self.config_dir = config_dir
        self.start = start
        self.end = end
        self.exclude = exclude
        self.max_bytes = max_bytes
        self.local_tz = local_tz
        self.cov: Dict[str, Any] = {
            "files_total": 0, "files_processed": 0, "files_unreadable": 0,
            "files_orphaned": 0, "files_superseded": 0, "lines_total": 0, "lines_processed": 0,
            "lines_unreadable": {}, "lines_oversize_skipped": 0, "lines_invalid_utf8": 0,
            "assistant_lines": 0, "records_before_dedup": 0, "records_after_dedup": 0,
            "dedup_fallback_uuid": 0, "dedup_no_key": 0, "synthetic_lines": 0,
            "usage_missing_lines": 0, "records_out_of_period": 0, "records_timestamp_missing": 0,
            "excluded_session_lines": 0, "excluded_session_records": 0, "user_lines_duplicate": 0,
        }
        self.line_types: Dict[str, int] = {}
        self.versions: Dict[str, int] = {}
        self.records: Dict[str, Dict[str, Any]] = {}
        self.excluded_keys: Set[str] = set()
        self.tool_uses: Dict[str, Tuple[str, str, Optional[str], Optional[str]]] = {}
        self.tool_results: Dict[str, Tuple[int, float, str]] = {}
        self.seen_user: Set[str] = set()
        self.commands: Dict[str, int] = {}
        self.session_ts: Dict[str, List[float]] = {}
        self.session_agents: Dict[str, Set[str]] = {}
        self.session_turns: Dict[str, int] = {}
        self.cost_state: Dict[str, Dict[str, Dict[str, int]]] = {}
        self.attribution: Dict[str, Set[str]] = {}
        self.attribution_lines: Dict[str, int] = {}
        self.oldest: Optional[float] = None
        self.newest: Optional[float] = None
        self.files_with_lines = 0

    # ---- 走査

    def run(self) -> None:
        root = os.path.join(self.config_dir, "projects")
        paths = []
        for dirpath, dirs, files in os.walk(root):
            dirs.sort()
            for name in sorted(files):
                if ".jsonl" in name:
                    paths.append(os.path.join(dirpath, name))
        for i, p in enumerate(paths):
            self.cov["files_total"] += 1
            rel = os.path.relpath(p, root)
            if ".orphaned" in rel:
                self.cov["files_orphaned"] += 1
                continue
            if ".superseded" in rel:
                self.cov["files_superseded"] += 1
                continue
            if not p.endswith(".jsonl"):
                _inc(self.line_types, "_unknown_file")
                continue
            self._read_file(p, i)

    def _broken(self, kind: str) -> None:
        _inc(self.cov["lines_unreadable"], kind)

    def _read_file(self, path: str, fidx: int) -> None:
        had = False
        try:
            for lineno, body in iter_lines(path, self.max_bytes):
                self.cov["lines_total"] += 1
                had = True
                if body is None:
                    self.cov["lines_oversize_skipped"] += 1
                    continue
                if not body.strip():
                    self._broken("empty")
                    continue
                text = body.decode("utf-8", errors="replace")
                if "\ufffd" in text and b"\xef\xbf\xbd" not in body:
                    self.cov["lines_invalid_utf8"] += 1
                try:
                    ok = self._line(text, fidx, lineno)
                except Exception as e:  # noqa: BLE001 - 本文を出さないため種類だけ数える
                    self._broken("error_" + type(e).__name__)
                    continue
                if ok:
                    self.cov["lines_processed"] += 1
        except OSError:
            self.cov["files_unreadable"] += 1
            return
        self.cov["files_processed"] += 1
        if had:
            self.files_with_lines += 1

    def _seen_ts(self, ts: Optional[float]) -> None:
        if ts is None:
            return
        if self.oldest is None or ts < self.oldest:
            self.oldest = ts
        if self.newest is None or ts > self.newest:
            self.newest = ts

    def _in_period(self, ts: Optional[float]) -> bool:
        return ts is not None and self.start <= ts < self.end

    def _line(self, text: str, fidx: int, lineno: int) -> bool:
        if RE_ASSISTANT.search(text):
            try:
                d = json.loads(text)
            except ValueError:
                self._broken("json_decode")
                return False
            if not isinstance(d, dict):
                self._broken("not_object")
                return False
            if d.get("type") == "assistant":
                _inc(self.line_types, "assistant")
                self._assistant(d, fidx, lineno)
                return True
            vals = {k: d.get(k) for k in TOP_FIELDS if k in d and not isinstance(d.get(k), (dict, list))}
            return self._other(vals, {}, text, d)
        stripped = text.strip()
        if not stripped.startswith("{"):
            self._broken("not_object")
            return False
        if not stripped.endswith("}"):
            self._broken("truncated")
            return False
        vals, offs = top_fields(text)
        return self._other(vals, offs, text, None)

    # ---- assistant 行

    def _assistant(self, d: Dict[str, Any], fidx: int, lineno: int) -> None:
        self.cov["assistant_lines"] += 1
        msg = d.get("message") if isinstance(d.get("message"), dict) else {}
        ts = parse_ts(d.get("timestamp"))
        self._seen_ts(ts)
        if msg.get("model") == "<synthetic>":
            self.cov["synthetic_lines"] += 1
            return
        mid, rid, uid = msg.get("id"), d.get("requestId"), d.get("uuid")
        if (isinstance(mid, str) and mid) or (isinstance(rid, str) and rid):
            key = "m:" + (mid if isinstance(mid, str) else "") + "|" + (rid if isinstance(rid, str) else "")
        elif isinstance(uid, str) and uid:
            key = "u:" + uid
            self.cov["dedup_fallback_uuid"] += 1
        else:
            key = "n:%d:%d" % (fidx, lineno)
            self.cov["dedup_no_key"] += 1
        sid = d.get("sessionId") if isinstance(d.get("sessionId"), str) else ""
        if self.exclude and sid == self.exclude:
            self.cov["excluded_session_lines"] += 1
            self.excluded_keys.add(key)
            return
        self.cov["records_before_dedup"] += 1
        if sid and self._in_period(ts):
            self.session_ts.setdefault(sid, []).append(ts)  # type: ignore[arg-type]
            agent = d.get("agentId")
            if isinstance(agent, str) and agent:
                self.session_agents.setdefault(sid, set()).add(agent)
        ver = d.get("version") if isinstance(d.get("version"), str) else "unknown"
        _inc(self.versions, _short_value(ver) if ver != "unknown" else ver)
        rec = self.records.get(key)
        if rec is None:
            rec = {"ts": None, "sid": sid, "agent": "", "side": False, "cwd": "", "model": "",
                   "effort": None, "pte": None, "version": "", "u": _zero_tokens(), "has_usage": False,
                   "tools": set(), "attr": None}
            self.records[key] = rec
        self._merge(rec, d, msg, ts, key)

    def _merge(self, rec: Dict[str, Any], d: Dict[str, Any], msg: Dict[str, Any],
               ts: Optional[float], key: str) -> None:
        if ts is not None and (rec["ts"] is None or ts < rec["ts"]):
            rec["ts"] = ts
        for field, src in (("sid", d.get("sessionId")), ("agent", d.get("agentId")), ("cwd", d.get("cwd")),
                           ("model", msg.get("model")), ("version", d.get("version"))):
            if isinstance(src, str) and src and (not rec[field] or src < rec[field]):
                rec[field] = src
        rec["side"] = rec["side"] or d.get("isSidechain") is True
        for field, src in (("effort", d.get("effort")), ("pte", d.get("perTurnEffort"))):
            if src is not None:
                v = _short_value(src) if not isinstance(src, (int, float)) else _short_value(str(src))
                if rec[field] is None or v > rec[field]:
                    rec[field] = v
        attr = _safe_name(d.get("attributionSkill"))
        if attr and (rec["attr"] is None or attr < rec["attr"]):
            rec["attr"] = attr
        if attr and rec["sid"] and self._in_period(ts):
            self.attribution.setdefault(attr, set()).add(rec["sid"])
            _inc(self.attribution_lines, attr)
        usage = msg.get("usage")
        if isinstance(usage, dict):
            rec["has_usage"] = True
            u = rec["u"]
            for k, f in USAGE_FIELDS.items():
                u[k] = max(u[k], _int(usage.get(f)))
            cc = usage.get("cache_creation")
            if isinstance(cc, dict):
                for k, f in CACHE_SUBFIELDS.items():
                    u[k] = max(u[k], _int(cc.get(f)))
        else:
            self.cov["usage_missing_lines"] += 1
        content = msg.get("content")
        if isinstance(content, list):
            for idx, block in enumerate(content):
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    self._tool_use(block, key, idx, rec)

    def _tool_use(self, block: Dict[str, Any], key: str, idx: int, rec: Dict[str, Any]) -> None:
        name = _safe_name(block.get("name")) or "(unparsable)"
        tid = block.get("id") if isinstance(block.get("id"), str) and block.get("id") else "%s#%s#%d" % (key, name, idx)
        inp = block.get("input") if isinstance(block.get("input"), dict) else {}
        ext = None
        for k in FILE_TOOL_KEYS:
            if isinstance(inp.get(k), str):
                ext = _extension(inp[k])
                break
        skill = None
        if name == "Skill":
            skill = _safe_name(inp.get("skill")) or "(unparsable)"
        self.tool_uses[tid] = (key, name, ext, skill)
        rec["tools"].add(tid)

    # ---- assistant 以外の行

    def _other(self, vals: Dict[str, Any], offs: Dict[str, int], text: str,
               parsed: Optional[Dict[str, Any]]) -> bool:
        ltype = vals.get("type")
        if not isinstance(ltype, str) or not ltype:
            self._broken("no_type")
            return False
        _inc(self.line_types, ltype if ltype in TOP_LINE_TYPES else "_other")
        sid = vals.get("sessionId") if isinstance(vals.get("sessionId"), str) else ""
        if ltype == "cost-state":
            mu = parsed.get("modelUsage") if parsed else (decode_at(text, offs["modelUsage"]) if "modelUsage" in offs else None)
            self._cost_state(sid, mu)
            return True
        if self.exclude and sid and sid == self.exclude:
            self.cov["excluded_session_lines"] += 1
            return True
        ts = parse_ts(vals.get("timestamp"))
        self._seen_ts(ts)
        if not self._in_period(ts) or not sid:
            return True
        self.session_ts.setdefault(sid, []).append(ts)  # type: ignore[arg-type]
        agent = vals.get("agentId")
        if isinstance(agent, str) and agent:
            self.session_agents.setdefault(sid, set()).add(agent)
        if ltype == "user":
            self._user(vals, offs, text, parsed, sid, ts)  # type: ignore[arg-type]
        return True

    def _user(self, vals: Dict[str, Any], offs: Dict[str, int], text: str,
              parsed: Optional[Dict[str, Any]], sid: str, ts: float) -> None:
        uid = vals.get("uuid")
        if isinstance(uid, str) and uid:
            if uid in self.seen_user:
                self.cov["user_lines_duplicate"] += 1
                return
            self.seen_user.add(uid)
        has_result = '"tool_result"' in text
        if "<command-name>" in text:
            for name in RE_COMMAND.findall(text):
                _inc(self.commands, name)
        if has_result:
            msg = parsed.get("message") if parsed else (decode_at(text, offs["message"]) if "message" in offs else None)
            self._tool_results(msg, sid, ts)
        elif not (vals.get("isMeta") is True or vals.get("isSidechain") is True
                  or vals.get("isCompactSummary") is True):
            self.session_turns[sid] = self.session_turns.get(sid, 0) + 1

    def _tool_results(self, msg: Any, sid: str, ts: float) -> None:
        if not isinstance(msg, dict) or not isinstance(msg.get("content"), list):
            return
        for block in msg["content"]:
            if not isinstance(block, dict) or block.get("type") != "tool_result":
                continue
            tid = block.get("tool_use_id") if isinstance(block.get("tool_use_id"), str) else ""
            if not tid:
                tid = "anon#%d" % len(self.tool_results)
            n = _content_chars(block.get("content"))
            prev = self.tool_results.get(tid)
            if prev is None or n > prev[0]:
                self.tool_results[tid] = (n, ts, sid)

    def _cost_state(self, sid: str, mu: Any) -> None:
        if not sid or not isinstance(mu, dict):
            return
        snap: Dict[str, Dict[str, int]] = {}
        for model, vals in mu.items():
            if not isinstance(vals, dict):
                continue
            bucket = classify_model(model)["bucket"] or "unknown"
            t = snap.setdefault(bucket, {k: 0 for k in TOKEN_TYPES})
            for k, f in MODEL_USAGE_FIELDS.items():
                t[k] += _int(vals.get(f))
        prev = self.cost_state.get(sid)
        if prev is None or _snap_total(snap) >= _snap_total(prev):
            self.cost_state[sid] = snap


def _snap_total(snap: Dict[str, Dict[str, int]]) -> int:
    return sum(sum(v.values()) for v in snap.values())


def _content_chars(content: Any) -> int:
    if isinstance(content, str):
        return len(content)
    if isinstance(content, list):
        total = 0
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                total += len(item["text"])
        return total
    return 0


def _extension(path: str) -> str:
    base = re.split(r"[\\/]", path)[-1]
    ext = os.path.splitext(base)[1].lower()
    if not ext:
        return "(none)"
    return ext if RE_EXT.match(ext) else "(other)"


def _bucket(n: float, buckets: Tuple[Tuple[int, str], ...], top: str) -> str:
    for limit, name in buckets:
        if n < limit:
            return name
    return top


def _percentile(values: List[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    return s[min(int(round(q * (len(s) - 1))), len(s) - 1)]


def session_length(ts_list: List[float]) -> Tuple[float, int]:
    """(稼働分, 区間数)。行の間隔が 30 分を超えたら分割し、区間内の間隔を足す。"""
    if not ts_list:
        return 0.0, 0
    s = sorted(ts_list)
    active = 0.0
    segments = 1
    for a, b in zip(s, s[1:]):
        gap = b - a
        if gap > SESSION_GAP_SECONDS:
            segments += 1
        else:
            active += gap
    return active / 60.0, segments


# ---------------------------------------------------------------- 集計結果の組み立て

class Report:
    """Collector の状態から出力 JSON を組み立てる。"""

    def __init__(self, c: Collector, settings: Dict[str, Any], installed: Dict[str, Any],
                 personal: Set[str], now: float) -> None:
        self.c = c
        self.settings = settings
        self.installed = installed
        self.personal = personal
        self.now = now

    def _local(self, epoch: float) -> datetime:
        dt = datetime.fromtimestamp(epoch, timezone.utc)
        return dt.astimezone() if self.c.local_tz else dt

    def build(self) -> Dict[str, Any]:
        c = self.c
        totals = _zero_tokens()
        buckets: Dict[str, Dict[str, Any]] = {}
        sessions: Dict[str, Dict[str, Any]] = {}
        session_all: Dict[str, Dict[str, Dict[str, int]]] = {}
        effort = {"effort": _tri(), "per_turn_effort": _tri()}
        by_version: Dict[str, Dict[str, int]] = {}
        by_day: Dict[str, int] = {}
        by_hour: Dict[str, int] = {"%02d" % h: 0 for h in range(24)}
        tools: Dict[str, int] = {}
        exts: Dict[str, int] = {}
        skills: Dict[str, int] = {}
        mcp: Dict[str, Dict[str, Any]] = {}
        api_calls = side_calls = 0
        in_period_keys: Set[str] = set()
        c.cov["records_after_dedup"] = len(c.records)
        c.cov["excluded_session_records"] = len(c.excluded_keys - set(c.records))
        for key in sorted(c.records):
            rec = c.records[key]
            if not rec["has_usage"]:
                rec["u"] = _zero_tokens()
            cls = classify_model(rec["model"])
            fam = cls["bucket"] or "unknown"
            sa = session_all.setdefault(rec["sid"], {}).setdefault(fam, {k: 0 for k in TOKEN_TYPES})
            for k in TOKEN_TYPES:
                sa[k] += rec["u"][k]
            if rec["ts"] is None:
                c.cov["records_timestamp_missing"] += 1
                continue
            if not c._in_period(rec["ts"]):
                c.cov["records_out_of_period"] += 1
                continue
            in_period_keys.add(key)
            api_calls += 1
            side_calls += 1 if rec["side"] else 0
            _add_tokens(totals, rec["u"])
            b = buckets.setdefault(fam, {"api_calls": 0, "generations": {}, "tokens": _zero_tokens()})
            b["api_calls"] += 1
            _inc(b["generations"], cls["generation"] or "unknown")
            _add_tokens(b["tokens"], rec["u"])
            ver = _short_value(rec["version"]) if rec["version"] else "unknown"
            v = by_version.setdefault(ver, {"records": 0, "effort_observed": 0, "per_turn_effort_observed": 0})
            v["records"] += 1
            for name, field in (("effort", "effort"), ("per_turn_effort", "pte")):
                _tri_add(effort[name], rec[field])
                if rec[field] is not None:
                    v[name + "_observed"] += 1
            lt = self._local(rec["ts"])
            _inc(by_day, lt.strftime("%Y-%m-%d"))
            _inc(by_hour, "%02d" % lt.hour)
            s = sessions.setdefault(rec["sid"], _new_session())
            s["api_calls"] += 1
            s["sidechain_calls"] += 1 if rec["side"] else 0
            _add_tokens(s["tokens"], rec["u"])
            _inc(s["models"], fam)
            if rec["cwd"]:
                _inc(s["cwds"], rec["cwd"])
            if rec["effort"] is not None:
                _inc(s["effort"], rec["effort"])
        for tid in sorted(c.tool_uses):
            key, name, ext, skill = c.tool_uses[tid]
            if key not in in_period_keys:
                continue
            sid = c.records[key]["sid"]
            s = sessions.setdefault(sid, _new_session())
            _inc(tools, name)
            _inc(s["tools"], name)
            if ext:
                _inc(exts, ext)
                _inc(s["exts"], ext)
            if skill:
                _inc(skills, skill)
            if name.startswith("mcp__"):
                parts = name.split("__")
                server = parts[1] if len(parts) > 2 and parts[1] else "(unparsable)"
                m = mcp.setdefault(server, {"calls": 0, "tools": set()})
                m["calls"] += 1
                m["tools"].add(name)
        for sid, ts_list in c.session_ts.items():
            s = sessions.setdefault(sid, _new_session())
            s["ts"] = ts_list
        return self._assemble(totals, buckets, sessions, session_all, effort, by_version, by_day,
                              by_hour, tools, exts, skills, mcp, api_calls, side_calls)

    def _assemble(self, totals: Dict[str, int], buckets: Dict[str, Any], sessions: Dict[str, Any],
                  session_all: Dict[str, Any], effort: Dict[str, Any], by_version: Dict[str, Any],
                  by_day: Dict[str, int], by_hour: Dict[str, int], tools: Dict[str, int],
                  exts: Dict[str, int], skills: Dict[str, int], mcp: Dict[str, Any],
                  api_calls: int, side_calls: int) -> Dict[str, Any]:
        c = self.c
        cov = dict(c.cov)
        bad = sum(cov["lines_unreadable"].values()) + cov["lines_oversize_skipped"]
        cov["coverage_ratio"] = round((cov["lines_total"] - bad) / cov["lines_total"], 4) if cov["lines_total"] else None
        cov["dedup_removed"] = cov["records_before_dedup"] - cov["records_after_dedup"]
        sess_out = self._sessions(sessions, totals)
        return {
            "schema_version": SCHEMA_VERSION,
            "generated_at": iso(self.now),
            "params": {"start": iso(c.start), "end": iso(c.end), "timezone": "local" if c.local_tz else "utc",
                       "utc_offset_minutes": self._offset_minutes(), "exclude_session_given": bool(c.exclude),
                       "max_line_bytes": c.max_bytes},
            "coverage": cov,
            "history_range": {"oldest_ts": iso(c.oldest), "newest_ts": iso(c.newest),
                              "files_with_lines": c.files_with_lines},
            "retention": self._retention(),
            "settings": self.settings,
            "line_types": dict(sorted(c.line_types.items())),
            "versions": dict(sorted(c.versions.items())),
            "totals": {"api_calls": api_calls, "sidechain_api_calls": side_calls,
                       "tokens_by_type": totals, "active_days": len(by_day),
                       "note": "token types are listed separately on purpose; do not add them up"},
            "models": {"buckets": dict(sorted(buckets.items()))},
            "effort": {"effort": effort["effort"], "per_turn_effort": effort["per_turn_effort"],
                       "by_version": dict(sorted(by_version.items())),
                       "note": "absent_n means not recorded (e.g. older version), not zero or low"},
            "sessions": sess_out,
            "projects": self._projects(sessions),
            "tools": {"calls_by_name": _sorted_counts(tools), "file_extensions": _sorted_counts(exts),
                      "result_chars": self._result_chars(), "tool_results_dir": self._tool_results_dir()},
            "skills": self._skills(skills),
            "mcp": {"servers_used": len(mcp), "configured_servers_count": self.settings.get("mcp_servers_count"),
                    "servers": {k: {"calls": v["calls"], "distinct_tools": len(v["tools"])}
                                for k, v in sorted(mcp.items())}},
            "cost_state": self._cost_state(session_all, set(sessions)),
            "timeline": {"timezone": "local" if c.local_tz else "utc", "by_day": dict(sorted(by_day.items())),
                         "by_hour": by_hour},
        }

    def _offset_minutes(self) -> int:
        if not self.c.local_tz:
            return 0
        off = datetime.fromtimestamp(self.now, timezone.utc).astimezone().utcoffset()
        return int(off.total_seconds() // 60) if off else 0

    def _retention(self) -> Dict[str, Any]:
        c = self.c
        days = self.settings.get("cleanup_period_days")
        src = "settings" if days is not None else "default_assumed"
        eff_days = days if days is not None else DEFAULT_CLEANUP_DAYS
        starts_after = c.oldest is not None and c.oldest > c.start + 86400
        cutoff = self.now - eff_days * 86400
        near = c.oldest is not None and abs(c.oldest - cutoff) <= RETENTION_NEAR_DAYS * 86400
        return {"cleanup_period_days": eff_days, "cleanup_period_days_source": src,
                "history_starts_after_period_start": starts_after, "oldest_near_cleanup_cutoff": near,
                "suspected_gap": bool(starts_after and near),
                "note": "suspicion only; older history may have been removed by retention or never existed"}

    def _sessions(self, sessions: Dict[str, Any], totals: Dict[str, int]) -> Dict[str, Any]:
        lengths: List[float] = []
        dist: Dict[str, int] = {}
        agents: Set[str] = set()
        details: Dict[str, Any] = {}
        for sid in sorted(sessions):
            s = sessions[sid]
            minutes, segs = session_length(s["ts"])
            s["minutes"], s["segments"] = minutes, segs
            lengths.append(minutes)
            _inc(dist, _bucket(minutes, LENGTH_BUCKETS, LENGTH_BUCKET_MAX))
            agents |= self.c.session_agents.get(sid, set())
        tops: Dict[str, List[Dict[str, Any]]] = {}
        for ttype, name in (("output", "top_by_output"), ("cache_creation", "top_by_cache_creation"),
                            ("input", "top_by_input"), ("cache_read", "top_by_cache_read")):
            ranked = sorted(sessions.items(), key=lambda kv: (-kv[1]["tokens"][ttype], kv[0]))[:TOP_N]
            tops[name] = []
            for sid, s in ranked:
                if s["tokens"][ttype] <= 0:
                    continue
                share = s["tokens"][ttype] / totals[ttype] if totals[ttype] else 0.0
                tops[name].append({"session": _label("S", sid), "value": s["tokens"][ttype],
                                   "share": round(share, 4)})
                details[_label("S", sid)] = self._session_detail(sid, s)
        out: Dict[str, Any] = {
            "count": len(sessions), "subagents_distinct": len(agents),
            "length_definition": "split when the gap between lines exceeds 30 minutes; sum active time",
            "active_minutes": {"total": round(sum(lengths), 1), "median": round(_percentile(lengths, 0.5), 1),
                               "p90": round(_percentile(lengths, 0.9), 1), "max": round(max(lengths or [0.0]), 1)},
            "length_buckets": dist,
        }
        out.update(tops)
        out["details"] = dict(sorted(details.items()))
        return out

    def _session_detail(self, sid: str, s: Dict[str, Any]) -> Dict[str, Any]:
        cwd = max(sorted(s["cwds"]), key=lambda k: s["cwds"][k]) if s["cwds"] else ""
        return {"project": _label("P", cwd) if cwd else None, "api_calls": s["api_calls"],
                "turns": self.c.session_turns.get(sid, 0), "active_minutes": round(s["minutes"], 1),
                "segments": s["segments"], "subagents": len(self.c.session_agents.get(sid, set())),
                "sidechain_ratio": round(s["sidechain_calls"] / s["api_calls"], 4) if s["api_calls"] else 0.0,
                "tokens": s["tokens"], "model_buckets": _sorted_counts(s["models"]),
                "effort": _sorted_counts(s["effort"]), "tools": _sorted_counts(s["tools"]),
                "file_extensions": _sorted_counts(s["exts"])}

    def _projects(self, sessions: Dict[str, Any]) -> Dict[str, Any]:
        proj: Dict[str, Dict[str, Any]] = {}
        for sid in sorted(sessions):
            s = sessions[sid]
            if not s["cwds"]:
                continue
            cwd = max(sorted(s["cwds"]), key=lambda k: s["cwds"][k])
            p = proj.setdefault(_label("P", cwd), {"sessions": 0, "api_calls": 0, "tokens": _zero_tokens()})
            p["sessions"] += 1
            p["api_calls"] += s["api_calls"]
            _add_tokens(p["tokens"], s["tokens"])
        ranked = sorted(proj.items(), key=lambda kv: (-kv[1]["tokens"]["output"], kv[0]))[:TOP_N]
        return {"count": len(proj), "label_rule": "P- + first 8 hex of sha256(cwd); no mapping is kept",
                "top_by_output": [dict(label=k, **v) for k, v in ranked]}

    def _result_chars(self) -> Dict[str, Any]:
        dist: Dict[str, int] = {}
        by_tool: Dict[str, Dict[str, int]] = {}
        total = count = mx = 0
        for tid in sorted(self.c.tool_results):
            n, ts, sid = self.c.tool_results[tid]
            if not self.c._in_period(ts):
                continue
            count += 1
            total += n
            mx = max(mx, n)
            _inc(dist, _bucket(n, RESULT_BUCKETS, RESULT_BUCKET_MAX))
            tu = self.c.tool_uses.get(tid)
            t = by_tool.setdefault(tu[1] if tu else "(unmatched)", {"count": 0, "chars": 0})
            t["count"] += 1
            t["chars"] += n
        return {"count": count, "chars_total": total, "chars_max": mx, "buckets": dist,
                "by_tool": dict(sorted(by_tool.items(), key=lambda kv: (-kv[1]["chars"], kv[0])))}

    def _tool_results_dir(self) -> Dict[str, int]:
        files = size = 0
        for dirpath, _dirs, names in os.walk(os.path.join(self.c.config_dir, "projects")):
            if os.path.basename(dirpath) != "tool-results" and os.sep + "tool-results" + os.sep not in dirpath + os.sep:
                continue
            for n in names:
                try:
                    size += os.path.getsize(os.path.join(dirpath, n))
                    files += 1
                except OSError:
                    continue
        return {"files": files, "bytes": size}

    def _skills(self, skill_calls: Dict[str, int]) -> Dict[str, Any]:
        cls = lambda n: classify_skill(n, self.personal)  # noqa: E731
        attr = {k: {"sessions": len(v), "lines": self.c.attribution_lines.get(k, 0), "classification": cls(k)}
                for k, v in sorted(self.c.attribution.items())}
        return {
            "skill_tool": {k: {"calls": v, "classification": cls(k)} for k, v in sorted(skill_calls.items())},
            "slash_commands": {k: {"count": v, "classification": cls(k)} for k, v in sorted(self.c.commands.items())},
            "attribution_skill": attr,
            "attribution_note": "sessions = distinct (sessionId, skill); lines are not invocation counts; "
                                "counted from lines whose timestamp is in the period",
            "classification_rule": "':' in name = plugin; matches config-dir/skills = personal; "
                                   "otherwise builtin_or_unknown",
            "installed": self.installed,
        }

    def _cost_state(self, session_all: Dict[str, Any], period_sessions: Set[str]) -> Dict[str, Any]:
        cs: Dict[str, Dict[str, int]] = {}
        tr: Dict[str, Dict[str, int]] = {}
        n = 0
        for sid in sorted(self.c.cost_state):
            if sid not in period_sessions:
                continue
            n += 1
            for fam, toks in self.c.cost_state[sid].items():
                dst = cs.setdefault(fam, {k: 0 for k in TOKEN_TYPES})
                for k in TOKEN_TYPES:
                    dst[k] += toks[k]
            for fam, toks in session_all.get(sid, {}).items():
                dst = tr.setdefault(fam, {k: 0 for k in TOKEN_TYPES})
                for k in TOKEN_TYPES:
                    dst[k] += toks[k]
        by_family = {}
        for fam in sorted(set(cs) | set(tr)):
            a = cs.get(fam, {k: 0 for k in TOKEN_TYPES})
            b = tr.get(fam, {k: 0 for k in TOKEN_TYPES})
            by_family[fam] = {"cost_state": a, "transcript": b,
                              "outside_transcript": {k: a[k] - b[k] for k in TOKEN_TYPES},
                              "only_in_cost_state": fam not in tr}
        return {"confidence": "estimate", "sessions_with_snapshot": n, "by_family": by_family,
                "note": "last snapshot per session (largest cumulative) minus deduplicated assistant usage of "
                        "the same sessions over all history; resume/fork behaviour unconfirmed; "
                        "money fields are discarded"}


def _new_session() -> Dict[str, Any]:
    return {"api_calls": 0, "sidechain_calls": 0, "tokens": _zero_tokens(), "models": {}, "cwds": {},
            "effort": {}, "tools": {}, "exts": {}, "ts": [], "minutes": 0.0, "segments": 0}


def _tri() -> Dict[str, Any]:
    return {"observed_n": 0, "absent_n": 0, "values": {}}


def _tri_add(t: Dict[str, Any], v: Optional[str]) -> None:
    if v is None:
        t["absent_n"] += 1
    else:
        t["observed_n"] += 1
        _inc(t["values"], v)


def _sorted_counts(d: Dict[str, int]) -> Dict[str, int]:
    return dict(sorted(d.items(), key=lambda kv: (-kv[1], kv[0])))


def cmd_collect(args: argparse.Namespace) -> int:
    start = parse_ts(args.start, args.local_tz)
    end = parse_ts(args.end, args.local_tz)
    if start is None or end is None:
        raise ArgError("start/end must be ISO8601")
    if start >= end:
        raise ArgError("start must be before end")
    if args.max_line_bytes <= 0:
        raise ArgError("max-line-bytes must be positive")
    config_dir = os.path.abspath(os.path.expanduser(args.config_dir))
    if not os.path.isdir(config_dir):
        raise ArgError("config-dir not found")
    now = datetime.now(timezone.utc).timestamp()
    col = Collector(config_dir, start, end, args.exclude_session or None, args.max_line_bytes, args.local_tz)
    col.run()
    installed, personal = installed_skills(config_dir)
    report = Report(col, read_settings(config_dir), installed, personal, now).build()
    _write_json(args.out, report)
    cov = report["coverage"]
    print("collect ok: files=%d processed=%d lines=%d" % (cov["files_total"], cov["files_processed"], cov["lines_total"]))
    print("api_calls_in_period=%d sessions=%d dedup_removed=%d coverage_ratio=%s" % (
        report["totals"]["api_calls"], report["sessions"]["count"], cov["dedup_removed"], cov["coverage_ratio"]))
    return 0


def _write_json(path: str, data: Any) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write("\n")


# ---------------------------------------------------------------- scan

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
    ("path_windows", re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:\\[^\s`'\"<>|]+|\\\\[A-Za-z0-9._\-]+\\[^\s`'\"<>|]+"), True),
    ("path_home", re.compile(r"(?<![\w])~[/\\][^\s`'\"<>|)]*"), True),
    ("path_unix", re.compile(r"(?<![\w/.:~\-])/(?=[^/\s]*[A-Za-z])[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-/]+"), True),
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
                        cwd = _unescape(raw)
                        parts = [p for p in re.split(r"[\\/]+", cwd) if p]
                        words.update(p for p in parts if len(p) >= 2 and p.lower() not in STOP_WORDS)
                    for rx in (re_skill, re_attr, re_mcp):
                        words.update(w for w in rx.findall(text) if len(w) >= 3)
            except OSError:
                continue
    for p in _skill_files(os.path.join(config_dir, "skills"), False):
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
            _inc(counts, kind)
            if redact:
                spans.append((m.start(), m.end()))
    for rx in forbidden:
        for m in rx.finditer(line):
            _inc(counts, "forbidden_word")
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


def cmd_scan(args: argparse.Namespace) -> int:
    for t in args.targets:
        if not os.path.exists(t):
            raise ArgError("target not found")
    forbidden = build_forbidden(os.path.expanduser(args.config_dir) if args.config_dir else None, args.subject_name)
    result: Dict[str, Any] = {"schema_version": SCAN_SCHEMA_VERSION, "files_scanned": 0, "files_skipped_binary": 0,
                              "files_unreadable": 0, "total_hits": 0, "by_kind": {}, "violations": [],
                              "redact": bool(args.redact), "redacted_hits": 0,
                              "note": "matched strings are never written; unfilled placeholders are reported only"}
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
        lines = text.splitlines(keepends=True)
        changed = False
        for i, line in enumerate(lines):
            counts, spans = scan_line(line, forbidden)
            for kind, n in sorted(counts.items()):
                result["violations"].append({"kind": kind, "file": shown, "line": i + 1, "count": n})
                result["total_hits"] += n
                _inc(result["by_kind"], kind, n)
            if args.redact and spans and decodable:
                lines[i] = _apply_redaction(line, spans)
                result["redacted_hits"] += len(spans)
                changed = True
        if changed:
            with open(path, "w", encoding="utf-8", newline="") as f:
                f.write("".join(lines))
    _write_json(args.out, result)
    print("scan ok: files=%d hits=%d redacted=%d" % (result["files_scanned"], result["total_hits"],
                                                     result["redacted_hits"]))
    return 0


# ---------------------------------------------------------------- CLI

class _Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:  # type: ignore[override]
        sys.stderr.write("argument error\n")
        raise SystemExit(2)


def build_parser() -> argparse.ArgumentParser:
    p = _Parser(prog="collect.py")
    sub = p.add_subparsers(dest="cmd", parser_class=_Parser)
    c = sub.add_parser("collect")
    c.add_argument("--config-dir", required=True)
    c.add_argument("--start", required=True)
    c.add_argument("--end", required=True)
    c.add_argument("--out", required=True)
    c.add_argument("--exclude-session", default=None)
    c.add_argument("--max-line-bytes", type=int, default=DEFAULT_MAX_LINE_BYTES)
    c.add_argument("--local-tz", action="store_true")
    s = sub.add_parser("scan")
    s.add_argument("--targets", nargs="+", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--config-dir", default=None)
    s.add_argument("--subject-name", default=None)
    s.add_argument("--redact", action="store_true")
    return p


def main(argv: Optional[List[str]] = None) -> int:
    try:
        args = build_parser().parse_args(argv)
        if args.cmd == "collect":
            return cmd_collect(args)
        if args.cmd == "scan":
            return cmd_scan(args)
        sys.stderr.write("argument error\n")
        return 2
    except ArgError as e:
        sys.stderr.write("argument error: %s\n" % e)
        return 2
    except SystemExit as e:
        return int(e.code) if isinstance(e.code, int) else 2
    except BaseException as e:  # noqa: BLE001 - 本文断片を出さないため種類名だけ出す
        sys.stderr.write("error: %s\n" % type(e).__name__)
        return 3


if __name__ == "__main__":
    sys.exit(main())
