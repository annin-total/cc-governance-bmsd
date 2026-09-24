#!/usr/bin/env python3
"""hook 入力の実サンプルを無害化して tests/fixtures/hook_inputs/ にコピーする使い捨てスクリプト。

置換規則:
  - 自由文の可能性があるキー（トップレベル）:
      prompt / tool_response / message / last_assistant_message /
      custom_instructions / error / command_args
    -> キーが存在すれば、値が null でもセンチネル文字列に置換する。
       値が dict / list ならその中の文字列だけをすべてセンチネルに置換し、構造は保つ。
  - tool_input.command / tool_input.description / tool_input.query
    -> キーが存在すれば同様にセンチネル文字列に置換する。
  - cwd / transcript_path / scratchpad_dir
    -> ホームディレクトリ部分（実行環境の `Path.home()` の値とその URL エンコード的な
       ダッシュ表記）を "/home/u" / "-home-u-" に置換する。

センチネルは "SENTINEL-<連番>" とし、置換のたびにグローバルなカウンタを進める。
DST_DIR は実行のたびに空にしてから SRC_DIR の全件をコピーし直す（採取コーパスを
丸ごと入れ替える）ため、部分再採取（採取し直した一部のファイルだけを渡すこと）が
既存ファイルと混ざって混成コーパスになることはない。件数一致と SENTINEL の
一意性、無害化後にホームパスが残っていないことを、コピーのたびに assert で確かめる。
"""

import json
import re
import sys
from pathlib import Path

# SRC_DIR: hook stdin を再採取するたびに、採取先ディレクトリを第1引数で渡す
# （生の採取データは git に入れないため、リポジトリにはデフォルト値を持たない）。
# DST_DIR: 常にこのリポジトリの tests/fixtures/hook_inputs/ を指す。
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]
SRC_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else SCRIPT_DIR / "raw"
DST_DIR = REPO_ROOT / "tests" / "fixtures" / "hook_inputs"

FREE_TEXT_TOP_KEYS = (
    "prompt",
    "tool_response",
    "message",
    "last_assistant_message",
    "custom_instructions",
    "error",
    "command_args",
)
TOOL_INPUT_FREE_KEYS = ("command", "description", "query")
PATH_KEYS = ("cwd", "transcript_path", "scratchpad_dir")

# 実行環境の実ホームパスから導出する（開発者ごとに異なるため固定値にしない）。
HOME_PLAIN = str(Path.home())
HOME_PLAIN_TO = "/home/u"
HOME_DASH = "-" + HOME_PLAIN.strip("/").replace("/", "-") + "-"
HOME_DASH_TO = "-home-u-"

_counter = 0


def _sentinel() -> str:
    global _counter
    _counter += 1
    return f"SENTINEL-{_counter}"


def _replace_strings(value):
    """文字列の葉だけをセンチネルに置換し、構造と非文字列の値は保つ。"""
    if value is None:
        return None
    if isinstance(value, str):
        return _sentinel()
    if isinstance(value, dict):
        return {k: _replace_strings(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_replace_strings(v) for v in value]
    return value


def _sanitize_free_text_value(value):
    """トップレベルの自由文キーの値を無害化する（null でもセンチネルにする）。"""
    if value is None:
        return _sentinel()
    return _replace_strings(value)


def _sanitize_path(value: str) -> str:
    return value.replace(HOME_PLAIN, HOME_PLAIN_TO).replace(HOME_DASH, HOME_DASH_TO)


def sanitize(obj: dict) -> dict:
    for key in FREE_TEXT_TOP_KEYS:
        if key in obj:
            obj[key] = _sanitize_free_text_value(obj[key])

    tool_input = obj.get("tool_input")
    if isinstance(tool_input, dict):
        for key in TOOL_INPUT_FREE_KEYS:
            if key in tool_input:
                tool_input[key] = _sanitize_free_text_value(tool_input[key])

    for key in PATH_KEYS:
        if key in obj and isinstance(obj[key], str):
            obj[key] = _sanitize_path(obj[key])

    return obj


def main():
    src_files = sorted(SRC_DIR.glob("*.json"))
    assert src_files, (
        f"{SRC_DIR} に *.json が無い（採取先を第1引数で指定したか確認する）"
    )

    # 採取コーパスを丸ごと入れ替える: 先に DST_DIR の *.json を空にしてからコピーし直す。
    # 部分再採取（一部ファイルだけの再採取）を渡しても、既存ファイルと混ざった
    # 混成コーパスになることを構造的に防ぐ。
    DST_DIR.mkdir(parents=True, exist_ok=True)
    for old in DST_DIR.glob("*.json"):
        old.unlink()

    for src in src_files:
        with open(src, encoding="utf-8") as f:
            obj = json.load(f)
        sanitized = sanitize(obj)
        text = json.dumps(sanitized, ensure_ascii=False, indent=2) + "\n"
        assert HOME_PLAIN not in text and HOME_DASH not in text, (
            f"{src.name}: 無害化後も実ホームパスが残っている（無害化漏れ）"
        )
        dst = DST_DIR / src.name
        with open(dst, "w", encoding="utf-8") as f:
            f.write(text)

    dst_files = sorted(DST_DIR.glob("*.json"))
    assert len(dst_files) == len(src_files), (
        f"コピー件数が一致しない（取り違え・部分コピーの疑い）: "
        f"src={len(src_files)} dst={len(dst_files)}"
    )

    sentinels = []
    for dst in dst_files:
        sentinels += re.findall(r"SENTINEL-\d+", dst.read_text(encoding="utf-8"))
    assert len(sentinels) == len(set(sentinels)), (
        f"SENTINEL が DST 全体で重複している（{len(sentinels)} 件中 "
        f"{len(sentinels) - len(set(sentinels))} 件が重複）"
    )

    print(f"done: {len(src_files)} files replaced, sentinels used: {_counter}")


if __name__ == "__main__":
    main()
