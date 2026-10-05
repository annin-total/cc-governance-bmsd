"""SessionStart hook のエントリ。各段を個別に例外から守り、1 つの失敗で残りを止めない。

無効化スイッチが止めるのは利用ログの収集だけ。標準出力には何も書かない。設定の適用・policy イベント・送信判定は止めない。
"""

if __name__ == "__main__":
    # collect.py と同じ理由（import 中の SIGINT でトレースバックが漏れる）で先に無視する。
    import _signal

    _signal.signal(_signal.SIGINT, _signal.SIG_IGN)

import os
import sys
import time
from typing import Any, Optional

import _govdir
import _identity
import _spool
from _settings import apply_settings
from collect import (
    _DISABLE_ENV,
    _read_stdin_json,
    append_error,
    extract_event,
    send_if_due,
)
from contract import POLICY_COLUMNS, coerce, to_day


def _policy_row(
    key_name: str,
    value: Optional[str],
    prev_value: Optional[str],
    apply_result: str,
    ts: int,
    plugin_version: Optional[str],
) -> dict:
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


def _apply_settings_step() -> None:
    """設定を適用し、結果を policy イベントとしてキューに積む。

    `policy` の import と版の取得をここに置き、その失敗を収集へ波及させない。
    """
    import policy

    plugin_version = _identity.get_plugin_version()
    rows = apply_settings(_govdir.settings_path(), policy, _govdir.governance_dir())
    ts = int(time.time())
    for key_name, value, prev_value, apply_result in rows:
        _spool.append(
            _policy_row(key_name, value, prev_value, apply_result, ts, plugin_version)
        )


def _collect_step(hook_event: Optional[str], disabled: bool) -> None:
    """利用ログを収集し、送信条件を判定する。送信判定は無効化スイッチの外側で行う。

    標準入力の読み取り（`RecursionError` などを投げうる）もここに置き、失敗を他の段へ波及させない。
    """
    if not disabled:
        raw_input = _read_stdin_json()
        _spool.append(extract_event(raw_input, hook_event))

    send_if_due()


def main() -> None:
    hook_event: Optional[str] = sys.argv[1] if len(sys.argv) > 1 else None
    disabled = bool(os.environ.get(_DISABLE_ENV))

    # 以降の段はキャッシュを読む。git の設定の変更をセッションごとに拾うため、ここで解決し直す
    try:
        _identity.get_user_email(refresh=True)
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("identity", type(e).__name__, hook_event)

    # 設定より先に置く。設定がこのファイルを指したとき、既に在るようにするため
    try:
        _govdir.sync_statusline(_govdir.governance_dir())
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("statusline", type(e).__name__, hook_event)

    try:
        _apply_settings_step()
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("apply_settings", type(e).__name__, hook_event)

    try:
        _collect_step(hook_event, disabled)
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("collect", type(e).__name__, hook_event)


if __name__ == "__main__":
    try:
        main()
    except BaseException:  # noqa: BLE001, S110 (hook は常に exit 0 で終わる)
        pass
