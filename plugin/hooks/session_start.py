"""SessionStart hook のエントリ。各段を個別に例外から守り、1 つの失敗で残りを止めない。

無効化スイッチが止めるのはお知らせと利用ログの収集だけ。設定の適用・policy イベント・送信判定・プラグインの更新は止めない。
"""

if __name__ == "__main__":
    # collect.py と同じ理由（import 中の SIGINT でトレースバックが漏れる）で先に無視する。
    import _signal

    _signal.signal(_signal.SIGINT, _signal.SIG_IGN)

import json
import os
import sys
import time
from typing import Any, Optional

import _backup
import _govdir
import _identity
import _notices
import _spool
import _updater
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

    `policy` の import と版の取得をここに置き、その失敗をお知らせと収集へ波及させない。
    """
    import policy

    plugin_version = _identity.get_plugin_version()
    rows = apply_settings(_govdir.settings_path(), policy, _govdir.governance_dir())
    ts = int(time.time())
    for key_name, value, prev_value, apply_result in rows:
        _spool.append(
            _policy_row(key_name, value, prev_value, apply_result, ts, plugin_version)
        )


def _backup_step() -> None:
    """導入・更新の後の最初のセッションで、適用より前の settings.json を保存する。"""
    _backup.backup_if_updated(_identity.get_plugin_version())


def _mark_seen(notice: dict, seen: set) -> None:
    """表示した 1 件を既読にする。非対話の起動では書かない（人が見ていないため）。"""
    if _notices.is_headless():
        return
    _notices._write_seen(seen | {notice["id"]})


def _emit_output(output: dict) -> bool:
    """hook の JSON 出力を標準出力へ 1 個だけ書く。書けたら真。

    失敗時は fd 1 を `/dev/null` に差し替える。残ったバッファの flush が終了時に標準エラーへ漏れ exit 120 になるため（`sys.stdout` の差し替えでは防げない）。
    """
    try:
        sys.stdout.write(json.dumps(output, ensure_ascii=False))
        sys.stdout.write("\n")
        sys.stdout.flush()
        return True
    except Exception:  # noqa: BLE001 (hook は例外を外に出さない)
        try:
            os.dup2(os.open(os.devnull, os.O_WRONLY), 1)
        except OSError:
            pass
        return False


def _collect_step(raw_input: Any, hook_event: Optional[str], disabled: bool) -> None:
    """利用ログを収集し、送信条件を判定する。送信判定は無効化スイッチの外側で行う。"""
    if not disabled:
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
        _backup_step()
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("backup", type(e).__name__, hook_event)

    try:
        _apply_settings_step()
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("apply_settings", type(e).__name__, hook_event)

    # 標準入力は 1 回しか読めないので、お知らせ・更新（source）と収集で共有する。更新は無効化スイッチでも止めない。
    # 読み取りは RecursionError などを投げうるため、失敗は収集の段として記録し、他の段へ波及させない。
    raw_input: Any = None
    read_failed = False
    try:
        raw_input = _read_stdin_json()
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        # 無効化した端末は収集しないので、記録せずに送信判定まで進める
        if not disabled:
            read_failed = True
            append_error("collect", type(e).__name__, hook_event)
    source = raw_input.get("source") if isinstance(raw_input, dict) else None

    try:
        output, notice, seen = _notices.notices_step(
            disabled, source, _notices._NOTICES_PATH
        )
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        output, notice, seen = {}, None, set()
        append_error("notices", type(e).__name__, hook_event)

    # 出力は必ず 1 回だけ行う。ここより上で何が失敗しても、少なくとも空の JSON を出す。
    if _emit_output(output) and notice is not None:
        try:
            _mark_seen(notice, seen)
        except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
            append_error("mark_seen", type(e).__name__, hook_event)

    try:
        _updater.update_if_due(source)
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("update", type(e).__name__, hook_event)

    if read_failed:
        return
    try:
        _collect_step(raw_input, hook_event, disabled)
    except Exception as e:  # noqa: BLE001 (hook は例外を外に出さない)
        append_error("collect", type(e).__name__, hook_event)


if __name__ == "__main__":
    try:
        main()
    except BaseException:  # noqa: BLE001, S110 (hook は常に exit 0 で終わる)
        pass
