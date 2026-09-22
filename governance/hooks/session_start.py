"""SessionStart hook のエントリ。設定の適用結果を policy イベントとしてキューに積み、
未読のお知らせ（`notices.json`）を選別する。
"""

if __name__ == "__main__":
    # collect.py と同じ理由（R-42）で、スクリプト起動時だけ SIGINT を無視する。
    import _signal

    _signal.signal(_signal.SIGINT, _signal.SIG_IGN)

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

import _identity
import _spool
from _settings import apply_settings
from _spool import _state_dir
from contract import POLICY, POLICY_COLUMNS, coerce, to_day

_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR"
_SETTINGS_FILENAME = "settings.json"
_SEEN_FILENAME = "seen.json"

_NOTICES_PATH = Path(__file__).resolve().parent.parent / "notices.json"


def _settings_path() -> Path:
    """`settings.json` のパスを解決する。`CLAUDE_CONFIG_DIR` が無ければ `~/.claude` の下。"""
    config_dir = os.environ.get(_CONFIG_DIR_ENV)
    base = Path(config_dir) if config_dir else Path.home() / ".claude"
    return base / _SETTINGS_FILENAME


def _policy_row(
    key_name: str,
    value: Optional[str],
    prev_value: Optional[str],
    apply_result: str,
    ts: int,
    plugin_version: Optional[str],
) -> dict:
    """1 件の適用結果を policy イベント（キューの 1 行）に組み立てる。"""
    raw = {
        "event_id": _identity.new_event_id(),
        "ts": ts,
        "day": to_day(ts),
        "user_email": _identity.get_user_email(),
        "host": _identity.get_host(),
        "key_name": key_name,
        "value": value,
        "prev_value": prev_value,
        "apply_result": apply_result,
        "plugin_version": plugin_version,
    }
    row: dict[str, Any] = {"kind": "policy"}
    for name, type_str in POLICY_COLUMNS:
        row[name] = coerce(raw.get(name), type_str)
    return row


def _apply_settings_step(plugin_version: Optional[str]) -> None:
    """設定を適用し、結果を policy イベントとしてキューに積む。無効化スイッチの影響を受けない。"""
    rows = apply_settings(_settings_path(), POLICY)
    ts = int(time.time())
    for key_name, value, prev_value, apply_result in rows:
        _spool.append(_policy_row(key_name, value, prev_value, apply_result, ts, plugin_version))


def _seen_path() -> Path:
    """既読 ID 集合 `seen.json` のパスを返す。状態ディレクトリの規則は `_spool` に従う。"""
    return _state_dir() / _SEEN_FILENAME


def _read_notices() -> list:
    """`notices.json` を読む。無い・壊れている・配列でない場合は空リストとする。"""
    try:
        with open(_NOTICES_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    return [n for n in data if isinstance(n, dict) and isinstance(n.get("id"), str)]


def _read_seen() -> set:
    """既読 ID の集合を読む。無い・壊れている・配列でない場合は空集合とする。"""
    try:
        with open(_seen_path(), encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return set()
    if not isinstance(data, list):
        return set()
    return {item for item in data if isinstance(item, str)}


def _select_unread(notices: list, seen: set) -> list:
    """未読（`seen` に無い id）のお知らせだけを、`notices` の順序を保って返す。"""
    return [n for n in notices if n["id"] not in seen]


def _write_seen(seen_ids: set) -> None:
    """既読 ID の集合を `seen.json` に書く。失敗しても例外を外に出さない。"""
    path = _seen_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(sorted(seen_ids), f)
    except OSError:
        pass


def _format_message(unread: list) -> str:
    """未読のお知らせを、空行 1 つで区切った 1 つの文字列にまとめる。件ごとの接頭辞は付けない。"""
    parts = []
    for notice in unread:
        title = notice.get("title")
        body = notice.get("body", "")
        parts.append(f"{title}\n{body}" if isinstance(title, str) and title else body)
    return "\n\n".join(parts)


def _emit_output(output: dict) -> bool:
    """hook の JSON 出力を標準出力へ 1 個だけ書く。書き出しと flush が例外なく終われば真。"""
    try:
        sys.stdout.write(json.dumps(output, ensure_ascii=False))
        sys.stdout.write("\n")
        sys.stdout.flush()
        return True
    except Exception:  # noqa: BLE001 (hook は例外を外に出さない)
        return False


def _notices_step() -> None:
    """未読のお知らせを systemMessage として出力する。出力成功後にだけ既読に加える。"""
    seen = _read_seen()
    unread = _select_unread(_read_notices(), seen)

    output: dict[str, Any] = {}
    if unread:
        output["systemMessage"] = _format_message(unread)

    if _emit_output(output) and unread:
        _write_seen(seen | {n["id"] for n in unread})


def main() -> None:
    """設定の適用結果を policy イベントとしてキューに積み、未読のお知らせを出力する。"""
    plugin_version = _identity.get_plugin_version()

    try:
        _apply_settings_step(plugin_version)
    except Exception:  # noqa: BLE001 (hook は例外を外に出さない)
        pass

    try:
        _notices_step()
    except Exception:  # noqa: BLE001 (hook は例外を外に出さない)
        pass


if __name__ == "__main__":
    try:
        main()
    except BaseException:  # noqa: BLE001, S110 (hook は常に exit 0 で終わる)
        pass
