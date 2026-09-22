#!/usr/bin/env bash
# validate-plugin.sh — プラグインの「差し込み前」形式検証。
#
# 検証するのは Claude Code プラグインとしての「形式」に加えて、このプラグインの
# 設計（docs/design.md・CLAUDE.md）が定める根幹の不変条件である。不変条件とは
# 「契約の正本が在ること」「標準ライブラリだけで動くこと」「hook が exit 0 で
# 静かに終わること」「py39 構文であること」を指し、実装の詳細が変わっても残る。
#
# 一方で、頻繁に変わる構造には厳格性を要求しない。列名・キー・件数・
# ファイル一覧・config.json の個々のフィールドの値・notices.json の中身は
# 一切検証しない。「在ること」は見るが「何であるか」は見ない、が切り分けの基準
# である。将来ここに列名やキーの検査を足さないこと。
#
# 使い方: scripts/validate-plugin.sh [プラグインのディレクトリ名]（既定: governance）

set -u
export PYTHONDONTWRITEBYTECODE=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_NAME="${1:-governance}"
PLUGIN_DIR="$REPO_ROOT/$PLUGIN_NAME"

FAIL=0
ok()  { echo "[OK] $1"; }
ng()  { echo "[NG] $1"; FAIL=1; }

if [ ! -d "$PLUGIN_DIR" ]; then
  ng "プラグインディレクトリが存在しない: $PLUGIN_DIR"
  exit 1
fi

# --- 1. plugin.json の存在・パース可否・name/version の非空文字列 ---
PLUGIN_JSON="$PLUGIN_DIR/.claude-plugin/plugin.json"
if [ -f "$PLUGIN_JSON" ]; then
  if python3 - "$PLUGIN_JSON" <<'PY' 2>/dev/null
import json, sys
with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)
name = data.get("name")
version = data.get("version")
ok = isinstance(name, str) and name.strip() and isinstance(version, str) and version.strip()
sys.exit(0 if ok else 1)
PY
  then
    ok "plugin.json: パース可能かつ name/version が非空"
  else
    ng "plugin.json: パース不可、または name/version が空・非文字列"
  fi
else
  ng "plugin.json が存在しない: $PLUGIN_JSON"
fi

# --- 2. プラグイン配下の全 *.json がパースできる ---
JSON_FAIL=0
while IFS= read -r -d '' f; do
  if ! python3 -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$f" "$f" 2>/dev/null; then
    ng "JSON パース失敗: $f"
    JSON_FAIL=1
  fi
done < <(find "$PLUGIN_DIR" -name '*.json' -print0)
[ "$JSON_FAIL" -eq 0 ] && ok "すべての *.json がパース可能"

# --- 3. プラグイン配下の全 *.py が構文として通る（バイトコードは書かない）---
PY_FAIL=0
while IFS= read -r -d '' f; do
  if ! python3 -c "import sys; compile(open(sys.argv[1], encoding='utf-8').read(), sys.argv[1], 'exec')" "$f" 2>/dev/null; then
    ng "Python 構文エラー: $f"
    PY_FAIL=1
  fi
done < <(find "$PLUGIN_DIR" -name '*.py' -print0)
[ "$PY_FAIL" -eq 0 ] && ok "すべての *.py が構文として妥当"

# --- 4. hooks/hooks.json の各 command が指すファイルが実在する ---
HOOKS_JSON="$PLUGIN_DIR/hooks/hooks.json"
if [ -f "$HOOKS_JSON" ]; then
  MISSING=$(python3 - "$HOOKS_JSON" "$PLUGIN_DIR" <<'PY'
import json, re, sys

hooks_path, plugin_dir = sys.argv[1], sys.argv[2]
with open(hooks_path, encoding="utf-8") as f:
    data = json.load(f)

commands = []
def walk(node):
    if isinstance(node, dict):
        if isinstance(node.get("command"), str):
            commands.append(node["command"])
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for v in node:
            walk(v)
walk(data)

missing = []
pattern = re.compile(r"\$\{CLAUDE_PLUGIN_ROOT\}/([^\s\"]+)")
for cmd in commands:
    for rel in pattern.findall(cmd):
        import os
        if not os.path.isfile(os.path.join(plugin_dir, rel)):
            missing.append(rel)

for m in missing:
    print(m)
PY
  )
  if [ -n "$MISSING" ]; then
    while IFS= read -r m; do
      ng "hooks.json が参照するファイルが実在しない: $m"
    done <<< "$MISSING"
  else
    ok "hooks.json が参照するファイルはすべて実在する"
  fi
else
  ok "hooks/hooks.json は無い（検証対象外）"
fi

# --- 5. 開発用ファイルの混入なし ---
DEV_ARTIFACTS=$(find "$PLUGIN_DIR" \( \
  -name '__pycache__' -o \
  -name '*.pyc' -o \
  -name '.pytest_cache' -o \
  -name 'conftest.py' -o \
  -name 'test_*.py' -o \
  -name '*_test.py' -o \
  -name '.git' \
  \))
if [ -n "$DEV_ARTIFACTS" ]; then
  while IFS= read -r a; do
    ng "開発用ファイル/ディレクトリが混入: $a"
  done <<< "$DEV_ARTIFACTS"
else
  ok "開発用ファイル・生成物の混入なし"
fi

# --- 6. git に無視されているファイルが無い ---
IGNORED=$(git -C "$REPO_ROOT" ls-files --others --ignored --exclude-standard -- "$PLUGIN_NAME")
if [ -n "$IGNORED" ]; then
  while IFS= read -r i; do
    ng "git に無視されているファイルが存在: $i"
  done <<< "$IGNORED"
else
  ok "git に無視されているファイルは無い"
fi

# --- 7. 契約の正本（hooks/contract.py）が import でき、決められた名前が在る ---
# 中身（列名・キー・件数）は見ない。「在ること」だけを見る。
CONTRACT_PY=$(find "$PLUGIN_DIR" -name 'contract.py' -print -quit)
if [ -n "$CONTRACT_PY" ]; then
  CONTRACT_DIR="$(dirname "$CONTRACT_PY")"
  if python3 -c "
import importlib, sys
sys.path.insert(0, sys.argv[1])
mod = importlib.import_module('contract')
required = (
    'HOOK_FIELDS', 'EXTRA_COLUMNS', 'POLICY', 'POLICY_COLUMNS', 'CSV_COLUMNS',
    'dig', 'coerce', 'to_day', 'ddl',
)
missing = [n for n in required if not hasattr(mod, n)]
sys.exit(1 if missing else 0)
" "$CONTRACT_DIR" 2>/dev/null
  then
    ok "contract.py: import でき、契約の名前がすべて在る"
  else
    ng "contract.py: import に失敗、または契約の名前が欠けている"
  fi
else
  ng "契約の正本（contract.py）が見つからない"
fi

# --- 8. プラグイン配下の *.py が標準ライブラリだけで動く（pip install を要求しない） ---
if python3 -c "import sys; sys.exit(0 if hasattr(sys, 'stdlib_module_names') else 1)" 2>/dev/null; then
  LOCAL_MODULES=$(find "$PLUGIN_DIR" -name '*.py' -exec basename {} .py \; | sort -u)
  STDLIB_FAIL=0
  while IFS= read -r -d '' f; do
    BAD=$(LOCAL_MODULES="$LOCAL_MODULES" python3 -c "
import ast, sys

path = sys.argv[1]
local = set(sys.argv[2].split())
with open(path, encoding='utf-8') as fh:
    tree = ast.parse(fh.read(), filename=path)

bad = []
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            bad.append(alias.name.split('.')[0])
    elif isinstance(node, ast.ImportFrom):
        if node.level and node.level > 0:
            continue  # 相対importは常にローカル
        if node.module:
            bad.append(node.module.split('.')[0])

for name in bad:
    if name in sys.stdlib_module_names:
        continue
    if name in local:
        continue
    print(name)
" "$f" "$LOCAL_MODULES")
    if [ -n "$BAD" ]; then
      while IFS= read -r modname; do
        ng "標準ライブラリ外の import: $modname ($f)"
      done <<< "$BAD"
      STDLIB_FAIL=1
    fi
  done < <(find "$PLUGIN_DIR" -name '*.py' -print0)
  [ "$STDLIB_FAIL" -eq 0 ] && ok "すべての *.py が標準ライブラリ（と自モジュール）だけで動く"
else
  echo "[SKIP] 標準ライブラリ判定: この python3 に sys.stdlib_module_names が無い（3.10 未満）"
fi

# --- 9. hook が常に exit 0 で終わり、標準エラーに何も出さない（隔離実行）---
# 利用者の実ファイルに触れうる唯一の検査なので、実行前後で実 settings.json の
# ハッシュを比較する安全網をスクリプト自身が持つ。
REAL_SETTINGS="$HOME/.claude/settings.json"
_settings_hash() {
  if [ -f "$REAL_SETTINGS" ]; then
    shasum "$REAL_SETTINGS" | awk '{print $1}'
  else
    echo "MISSING"
  fi
}
SETTINGS_HASH_BEFORE=$(_settings_hash)

if [ -f "$HOOKS_JSON" ]; then
  HOOK_ISOLATION_DIR=$(mktemp -d)
  ISOLATED_PLUGIN_DATA="$HOOK_ISOLATION_DIR/plugin-data"
  ISOLATED_CONFIG_DIR="$HOOK_ISOLATION_DIR/config-dir"
  mkdir -p "$ISOLATED_PLUGIN_DATA" "$ISOLATED_CONFIG_DIR"

  TIMEOUT_BIN=""
  command -v timeout >/dev/null 2>&1 && TIMEOUT_BIN="timeout 5"

  HOOK_COMMANDS=$(python3 -c "
import json, sys

with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)

commands = []
def walk(node):
    if isinstance(node, dict):
        if isinstance(node.get('command'), str):
            commands.append(node['command'])
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for v in node:
            walk(v)
walk(data)

for c in commands:
    print(c)
" "$HOOKS_JSON")

  HOOK_FAIL=0
  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    STDERR_FILE=$(mktemp)
    echo '{}' | env \
      CLAUDE_PLUGIN_ROOT="$PLUGIN_DIR" \
      CLAUDE_PLUGIN_DATA="$ISOLATED_PLUGIN_DATA" \
      CLAUDE_CONFIG_DIR="$ISOLATED_CONFIG_DIR" \
      CC_GOVERNANCE_USER_EMAIL="validate-plugin-sh@example.invalid" \
      CC_GOVERNANCE_DISABLE=1 \
      PYTHONDONTWRITEBYTECODE=1 \
      $TIMEOUT_BIN bash -c "$cmd" >/dev/null 2>"$STDERR_FILE"
    rc=$?
    STDERR_CONTENT=$(cat "$STDERR_FILE")
    rm -f "$STDERR_FILE"
    if [ "$rc" -ne 0 ] || [ -n "$STDERR_CONTENT" ]; then
      ng "hook が exit 0・無出力で終わらない（rc=${rc}）: $cmd"
      HOOK_FAIL=1
    fi
  done <<< "$HOOK_COMMANDS"
  [ "$HOOK_FAIL" -eq 0 ] && ok "すべての hook が exit 0 で終わり、標準エラーに何も出さない"

  rm -rf "$HOOK_ISOLATION_DIR"
else
  echo "[SKIP] hook 実行検査: hooks/hooks.json が無い"
fi

SETTINGS_HASH_AFTER=$(_settings_hash)
if [ "$SETTINGS_HASH_BEFORE" = "$SETTINGS_HASH_AFTER" ]; then
  ok "実 ~/.claude/settings.json は変更されていない（隔離が効いている）"
else
  ng "実 ~/.claude/settings.json が変更された（隔離が効いていない・重大）"
fi

# --- 10. Python 3.9 で動く構文であること（ruff が使える場合のみ）---
if command -v ruff >/dev/null 2>&1; then
  if (cd "$REPO_ROOT" && ruff check "$PLUGIN_NAME" >/dev/null 2>&1); then
    ok "ruff check: py39 構文として妥当"
  else
    ng "ruff check で py39 構文の問題を検出"
  fi
else
  echo "[SKIP] ruff check: ruff が見つからない"
fi

if [ "$FAIL" -eq 0 ]; then
  echo "=== すべての検証に合格 ==="
  exit 0
else
  echo "=== 検証に失敗した項目がある ==="
  exit 1
fi
