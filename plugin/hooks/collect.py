"""全 hook 共通のイベント収集エントリ（`python3 collect.py <hook_event>`）。常に exit 0。"""

if __name__ == "__main__":
    # 下の import 中に SIGINT が届くと、try の外なのでトレースバックが標準エラーに漏れる。
    # そのため import より前に無視する。`signal` より import が桁違いに軽い `_signal` を使う。
    # スクリプト起動時だけ立てる（import した側のプロセスの SIGINT を殺さない）。
    import _signal

    _signal.signal(_signal.SIGINT, _signal.SIG_IGN)

import json
import os
import sys
import time
from typing import Any, Callable, Optional

import _context
import _identity
import _spool
from contract import ERROR_COLUMNS, EXTRA_COLUMNS, HOOK_FIELDS, coerce, dig, to_day

_TRANSCRIPT_HOOK_EVENTS = ("PreCompact", "Stop")
_SEND_CHECK_HOOK_EVENTS = ("SessionStart", "Stop")
_DISABLE_ENV = "CC_GOVERNANCE_DISABLE"


def extract_event(raw_input: Any, hook_event: Optional[str]) -> dict[str, Any]:
    """hook 入力からキューの 1 行を組み立てる。dict でない入力は hook 由来の列を None にする。"""
    obj = raw_input if isinstance(raw_input, dict) else {}

    ts = int(time.time())
    raw_extra = {
        "event_id": _identity.new_event_id(),
        "ts": ts,
        "day": to_day(ts),
        "user_email": _identity.get_user_email(),
        "host": _identity.get_host(),
        "hook_event": hook_event,
        "context_tokens": _from_transcript(_context.context_tokens, obj, hook_event),
        "claude_code_version": _from_transcript(
            _context.claude_code_version, obj, hook_event
        ),
    }

    row: dict[str, Any] = {"kind": "event"}
    for name, type_str in EXTRA_COLUMNS:
        row[name] = coerce(raw_extra.get(name), type_str)

    for name, path, type_str in HOOK_FIELDS:
        row[name] = coerce(dig(obj, path), type_str)

    return row


def append_error(stage: str, error_type: str, hook_event: Optional[str]) -> None:
    """失敗を error 行としてキューに積む。載せるのは固定値の段名と例外クラス名だけ。例外を外に出さない。"""
    try:
        try:
            user_email = _identity.get_user_email()
        except Exception:  # noqa: BLE001 (識別子の解決の失敗も記録する)
            user_email = None
        ts = int(time.time())
        raw = {
            "event_id": _identity.new_event_id(),
            "ts": ts,
            "day": to_day(ts),
            "user_email": user_email,
            "host": _identity.get_host(),
            "hook_event": hook_event,
            "plugin_version": _identity.get_plugin_version(),
            "stage": stage,
            "error_type": error_type,
        }
        row: dict[str, Any] = {"kind": "error"}
        for name, type_str in ERROR_COLUMNS:
            row[name] = coerce(raw.get(name), type_str)
        _spool.append(row)
    except Exception:  # noqa: BLE001, S110 (記録の失敗で hook を失敗させない)
        pass


def _from_transcript(read: Callable[[Any], Any], obj: dict, hook_event: Optional[str]):
    """transcript を読む hook でだけ `read(transcript_path)` を呼ぶ。"""
    if hook_event not in _TRANSCRIPT_HOOK_EVENTS:
        return None
    return read(dig(obj, ("transcript_path",)))


def _read_stdin_json() -> Any:
    """標準入力を JSON として読む。読めなければ None。"""
    try:
        text = sys.stdin.read()
    except (OSError, ValueError):
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def send_if_due() -> None:
    """送信条件を満たせば `sent_at` を更新し、送信プロセスを起動する。"""
    if not _spool.should_send():
        return
    # 先に sent_at を更新し、同時に開いたセッションの一斉起動を防ぐ。
    _spool.mark_sent()
    # 先頭で import すると urllib.request・ssl の読み込みを毎回払う。
    import _sender

    _sender.launch()


def main() -> None:
    if os.environ.get(_DISABLE_ENV):
        return

    hook_event: Optional[str] = sys.argv[1] if len(sys.argv) > 1 else None
    raw_input = _read_stdin_json()
    row = extract_event(raw_input, hook_event)
    _spool.append(row)

    if hook_event in _SEND_CHECK_HOOK_EVENTS:
        send_if_due()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error(
            "collect", type(e).__name__, sys.argv[1] if len(sys.argv) > 1 else None
        )
    except BaseException:  # noqa: BLE001, S110 (KeyboardInterrupt も含めて常に exit 0)
        pass
