#!/usr/bin/env bash
# governance/ を配布リポジトリの plugins/governance/ へ差し込み、配布物を検査する。
# 使い方:
#   scripts/release.sh [配布リポジトリのパス]              差し込み + 検査
#   scripts/release.sh --check-only [配布リポジトリのパス]  検査だけ
# コミットも push もしない。差し込みと検査が終わった状態で止め、人がコミットする。
set -euo pipefail

# 開発リポジトリの生成物・キャッシュが配布物へ混ざるのを防ぐ、唯一の除外パターン一覧。
EXCLUDE_PATTERNS=(
  "__pycache__"
  "*.pyc"
  ".pytest_cache"
  ".DS_Store"
  "*.log"
  "*.orig"
  "*.rej"
  "*~"
)

CHECK_ONLY=0
if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=1
  shift
fi

DIST_REPO="${1:-../cc-marketplace-governance-bmsd}"
GOVERNANCE_SRC="governance"
PLUGIN_REL="plugins/governance"
PLUGIN_DST="${DIST_REPO}/${PLUGIN_REL}"
PLUGIN_JSON_REL="${PLUGIN_REL}/.claude-plugin/plugin.json"
CONTRACT_REL="${PLUGIN_REL}/hooks/contract.py"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "[NG] $1"
  exit 1
}

require_git_worktree() {
  git -C "$DIST_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || fail "配布リポジトリが git の作業ツリーではありません: $DIST_REPO"
}

require_marketplace_json() {
  [[ -f "${DIST_REPO}/.claude-plugin/marketplace.json" ]] \
    || fail "配布リポジトリに .claude-plugin/marketplace.json がありません（無関係なリポジトリではないか確認すること）: $DIST_REPO"
}

# 前回の差し込みが未コミットのまま重なるのを防ぐ。
# 既に追跡済みのファイルへの変更（前回差し込んだ内容そのもの）は、そのまま重ねて
# 差し込んでよい —— 差し込みは常に governance/ の内容へ上書きする冪等な操作である。
# ただし plugins/governance/ の外の追跡済みの変更は、人の git add -A で紛れ込む
# 無関係な変更である可能性があるため、それも止める。
require_clean_worktree() {
  local untracked
  untracked=$(git -C "$DIST_REPO" status --porcelain | grep -c '^??' || true)
  if [[ "$untracked" -gt 0 ]]; then
    fail "配布リポジトリの作業ツリーが clean ではありません（未追跡のファイルがある）"
  fi

  local outside_changes
  outside_changes=$(git -C "$DIST_REPO" status --porcelain -- . ":!${PLUGIN_REL}" | wc -l | tr -d ' ')
  if [[ "$outside_changes" -gt 0 ]]; then
    fail "配布リポジトリの ${PLUGIN_REL} の外に追跡済みの変更があります"
  fi
}

perform_sync() {
  local rsync_excludes=()
  local p
  for p in "${EXCLUDE_PATTERNS[@]}"; do
    rsync_excludes+=(--exclude="$p")
  done
  mkdir -p "$PLUGIN_DST"
  rsync -a --delete "${rsync_excludes[@]}" "${GOVERNANCE_SRC}/" "${PLUGIN_DST}/"
  echo "----- 差し込み後の変更ファイル (${PLUGIN_REL}) -----"
  git -C "$DIST_REPO" status --porcelain -- "$PLUGIN_REL"
}

# 検査 1: 混入なし。ファイルの混入を優先して報告し、原因が分かる場所を示す
check_no_contamination() {
  local find_file_match find_dir_match match rel_match
  find_file_match=$(find "$PLUGIN_DST" -type f \( \
    -name '*.pyc' -o \
    -name '.DS_Store' -o \
    -name 'conftest.py' -o \
    -name 'test_*.py' -o \
    -name '*_test.py' -o \
    -name 'requirements*.txt' \
  \) -print -quit 2>/dev/null || true)
  find_dir_match=$(find "$PLUGIN_DST" -type d \( \
    -name '__pycache__' -o \
    -name '.pytest_cache' -o \
    -name 'fixtures' -o \
    -name '.git' \
  \) -print -quit 2>/dev/null || true)
  match="${find_file_match:-$find_dir_match}"
  if [[ -n "$match" ]]; then
    rel_match="${match#"${DIST_REPO}/"}"
    fail "混入: ${rel_match}"
  fi
  echo "[OK] 混入なし"
}

# 検査 2: 必須ファイルあり
check_required_files() {
  local required_files=(
    ".claude-plugin/plugin.json"
    "hooks/hooks.json"
    "hooks/contract.py"
    "hooks/collect.py"
    "hooks/session_start.py"
    "notices.json"
    "config.json"
  )
  local f
  for f in "${required_files[@]}"; do
    if [[ ! -e "${PLUGIN_DST}/${f}" ]]; then
      fail "必須ファイル欠落: $(basename "$f")"
    fi
  done
  echo "[OK] 必須ファイルあり"
}

# 検査 3: 開発リポジトリと一致（差し込み漏れと差し込み過剰を同時に捕まえる）。
# ファイルシステムの一致だけでは、配布リポジトリの .gitignore が実体を無視して
# いても検出できない。git が実際に追跡対象にできているかも合わせて確かめる。
check_matches_source() {
  local diff_excludes=()
  local p
  for p in "${EXCLUDE_PATTERNS[@]}"; do
    diff_excludes+=(-x "$p")
  done
  if ! diff -rq "${diff_excludes[@]}" "$GOVERNANCE_SRC" "$PLUGIN_DST" >/dev/null; then
    fail "開発リポジトリと不一致"
  fi

  local ignored
  ignored=$(git -C "$DIST_REPO" status --porcelain --ignored -- "$PLUGIN_REL" | grep '^!!' || true)
  if [[ -n "$ignored" ]]; then
    fail "差し込んだファイルが配布リポジトリの .gitignore に無視されています: $(echo "$ignored" | head -1 | sed 's/^!! //')"
  fi
  echo "[OK] 開発リポジトリと一致"
}

# 検査 4: 名前の一致
check_name_match() {
  local result
  result=$(python3 - "$PLUGIN_DST" "$DIST_REPO" <<'PY'
import json
import sys

plugin_dst, dist_repo = sys.argv[1], sys.argv[2]
try:
    plugin = json.load(open(f"{plugin_dst}/.claude-plugin/plugin.json"))
    marketplace = json.load(open(f"{dist_repo}/.claude-plugin/marketplace.json"))
    name = plugin.get("name")
    mkt_name = marketplace["plugins"][0]["name"]
except (OSError, ValueError, KeyError, IndexError) as e:
    print(f"ERROR:{type(e).__name__}: {e}")
else:
    if name != "governance" or name != mkt_name:
        print(f"NG:{name}:{mkt_name}")
    else:
        print("OK")
PY
)
  case "$result" in
    OK) echo "[OK] 名前の一致" ;;
    ERROR:*) fail "名前の一致を確認できません: ${result#ERROR:}" ;;
    *) fail "名前の不一致: ${result#NG:}" ;;
  esac
}

# 検査 5: version の引き上げ忘れ
check_version_bump() {
  if ! git -C "$DIST_REPO" cat-file -e "HEAD:${PLUGIN_JSON_REL}" 2>/dev/null; then
    echo "[SKIP] version（初回リリース）"
    return
  fi

  local old_version new_version changed_count cmp
  old_version=$(git -C "$DIST_REPO" show "HEAD:${PLUGIN_JSON_REL}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])')
  new_version=$(python3 -c 'import json;print(json.load(open("'"$PLUGIN_DST"'/.claude-plugin/plugin.json"))["version"])')
  # plugin.json 自身が version を書く場所であり、常に差分に含まれるため、
  # 「中身の変更が無いのに version だけ上がっている」の判定からは除く。
  changed_count=$(git -C "$DIST_REPO" status --porcelain -- "$PLUGIN_REL" ":!${PLUGIN_JSON_REL}" | wc -l | tr -d ' ')

  cmp=$(python3 - "$old_version" "$new_version" <<'PY'
import sys


def parse(v):
    parts = v.split(".")
    if not parts or any(not p.isdigit() for p in parts):
        raise ValueError(v)
    return tuple(int(p) for p in parts)


old_raw, new_raw = sys.argv[1], sys.argv[2]
try:
    old, new = parse(old_raw), parse(new_raw)
except ValueError as e:
    print(f"INVALID:{e}")
else:
    if new > old:
        print("GREATER")
    elif new == old:
        print("EQUAL")
    else:
        print("LESS")
PY
)

  case "$cmp" in
    INVALID:*)
      fail "version が数値のドット区切りではありません: ${old_version} -> ${new_version} (${cmp#INVALID:})"
      ;;
    EQUAL)
      if [[ "$changed_count" -gt 0 ]]; then
        fail "version 据え置き: ${old_version} のまま ${PLUGIN_REL} に ${changed_count} 件の変更がある"
      fi
      echo "[OK] version 据え置き（変更なし）"
      ;;
    LESS)
      fail "version 逆行: ${old_version} -> ${new_version}"
      ;;
    GREATER)
      if [[ "$changed_count" -eq 0 ]]; then
        fail "version のみ変更: 中身の変更が無いのに ${old_version} -> ${new_version} に上げている"
      fi
      echo "[OK] version ${old_version} -> ${new_version}"
      ;;
  esac
}

# 検査 6: POLICY からのキー削除
check_policy_keys() {
  if ! git -C "$DIST_REPO" cat-file -e "HEAD:${CONTRACT_REL}" 2>/dev/null; then
    echo "[SKIP] POLICY のキー（初回リリース）"
    return
  fi

  local contract_head_tmp removed_keys
  contract_head_tmp="${TMP_DIR}/contract_head.py"
  git -C "$DIST_REPO" show "HEAD:${CONTRACT_REL}" > "$contract_head_tmp"
  removed_keys=$(PYTHONDONTWRITEBYTECODE=1 python3 - "$contract_head_tmp" "${PLUGIN_DST}/hooks/contract.py" <<'PY'
import importlib.util
import sys

sys.dont_write_bytecode = True


def load_policy(path):
    spec = importlib.util.spec_from_file_location("contract_tmp", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return set(module.POLICY.keys())


old_path, new_path = sys.argv[1], sys.argv[2]
removed = load_policy(old_path) - load_policy(new_path)
for key in sorted(removed):
    print(key)
PY
)
  if [[ -n "$removed_keys" ]]; then
    while IFS= read -r key; do
      echo "[NG] POLICY からキーが削除されている: ${key}"
    done <<< "$removed_keys"
    echo "[NG] 削除は誤った値を全端末に固定する操作である。正しい値を書いて version を上げること"
    exit 1
  fi
  echo "[OK] POLICY のキーは削除されていない"
}

# 検査 7: 送信先が埋まっている（値の正しさは見ない）。
# 初回リリース前に人が 1 回埋めれば消える既知の未完了項目であり、検査 5・6 という
# 毎リリースで人の操作ミスを止める仕掛けより後に置く。
check_ingest_config_filled() {
  local result
  result=$(python3 - "$PLUGIN_DST" <<'PY'
import json
import sys

plugin_dst = sys.argv[1]
try:
    config = json.load(open(f"{plugin_dst}/config.json"))
except (OSError, ValueError) as e:
    print(f"ERROR:{type(e).__name__}: {e}")
else:
    missing = [k for k in ("ingest_url", "ingest_token") if not config.get(k)]
    print(",".join(missing) if missing else "OK")
PY
)
  case "$result" in
    OK) echo "[OK] 送信先が埋まっている" ;;
    ERROR:*) fail "送信先を確認できません: ${result#ERROR:}" ;;
    *) fail "送信先が空です: ${result}" ;;
  esac
}

require_git_worktree
require_marketplace_json

if [[ "$CHECK_ONLY" -eq 0 ]]; then
  require_clean_worktree
  perform_sync
fi

check_no_contamination
check_required_files
check_matches_source
check_name_match
check_version_bump
check_policy_keys
check_ingest_config_filled

exit 0
