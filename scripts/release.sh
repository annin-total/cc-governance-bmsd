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

fail() {
  echo "[NG] $1"
  exit 1
}

# --- 差し込み（--check-only では行わない） ---
if [[ "$CHECK_ONLY" -eq 0 ]]; then
  if ! git -C "$DIST_REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail "配布リポジトリが git の作業ツリーではありません: $DIST_REPO"
  fi
  if [[ -n "$(git -C "$DIST_REPO" status --porcelain)" ]]; then
    fail "配布リポジトリの作業ツリーが clean ではありません"
  fi

  RSYNC_EXCLUDES=()
  for p in "${EXCLUDE_PATTERNS[@]}"; do
    RSYNC_EXCLUDES+=(--exclude="$p")
  done

  mkdir -p "$PLUGIN_DST"
  rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${GOVERNANCE_SRC}/" "${PLUGIN_DST}/"

  echo "----- 差し込み後の変更ファイル (${PLUGIN_REL}) -----"
  git -C "$DIST_REPO" status --porcelain -- "$PLUGIN_REL"
fi

# --- 検査 ---

# 検査 1: 混入なし。ファイルの混入を優先して報告し、原因が分かる場所を示す
FIND_FILE_MATCH=$(find "$PLUGIN_DST" -type f \( \
  -name '*.pyc' -o \
  -name '.DS_Store' -o \
  -name 'conftest.py' -o \
  -name 'test_*.py' -o \
  -name '*_test.py' -o \
  -name 'requirements*.txt' \
\) -print -quit 2>/dev/null || true)
FIND_DIR_MATCH=$(find "$PLUGIN_DST" -type d \( \
  -name '__pycache__' -o \
  -name '.pytest_cache' -o \
  -name 'fixtures' -o \
  -name '.git' \
\) -print -quit 2>/dev/null || true)
FIND_MATCH="${FIND_FILE_MATCH:-$FIND_DIR_MATCH}"
if [[ -n "$FIND_MATCH" ]]; then
  REL_MATCH="${FIND_MATCH#"${DIST_REPO}/"}"
  fail "混入: ${REL_MATCH}"
fi
echo "[OK] 混入なし"

# 検査 2: 必須ファイルあり
REQUIRED_FILES=(
  ".claude-plugin/plugin.json"
  "hooks/hooks.json"
  "hooks/contract.py"
  "hooks/collect.py"
  "hooks/session_start.py"
  "notices.json"
  "config.json"
)
for f in "${REQUIRED_FILES[@]}"; do
  if [[ ! -e "${PLUGIN_DST}/${f}" ]]; then
    fail "必須ファイル欠落: $(basename "$f")"
  fi
done
echo "[OK] 必須ファイルあり"

# 検査 3: 開発リポジトリと一致（差し込み漏れと差し込み過剰を同時に捕まえる）
DIFF_EXCLUDES=()
for p in "${EXCLUDE_PATTERNS[@]}"; do
  DIFF_EXCLUDES+=(-x "$p")
done
if ! diff -rq "${DIFF_EXCLUDES[@]}" "$GOVERNANCE_SRC" "$PLUGIN_DST" >/dev/null; then
  fail "開発リポジトリと不一致"
fi
echo "[OK] 開発リポジトリと一致"

# 検査 4: 名前の一致
NAME_CHECK=$(python3 - "$PLUGIN_DST" "$DIST_REPO" <<'PY'
import json
import sys

plugin_dst, dist_repo = sys.argv[1], sys.argv[2]
plugin = json.load(open(f"{plugin_dst}/.claude-plugin/plugin.json"))
marketplace = json.load(open(f"{dist_repo}/.claude-plugin/marketplace.json"))
name = plugin.get("name")
mkt_name = marketplace["plugins"][0]["name"]
if name != "governance" or name != mkt_name:
    print(f"NG:{name}:{mkt_name}")
else:
    print("OK")
PY
)
if [[ "$NAME_CHECK" != "OK" ]]; then
  fail "名前の不一致: ${NAME_CHECK#NG:}"
fi
echo "[OK] 名前の一致"

# 検査 5: 送信先が埋まっている（値の正しさは見ない）
CONFIG_CHECK=$(python3 - "$PLUGIN_DST" <<'PY'
import json
import sys

plugin_dst = sys.argv[1]
config = json.load(open(f"{plugin_dst}/config.json"))
missing = [k for k in ("ingest_url", "ingest_token") if not config.get(k)]
print(",".join(missing) if missing else "OK")
PY
)
if [[ "$CONFIG_CHECK" != "OK" ]]; then
  fail "送信先が空です: ${CONFIG_CHECK}"
fi
echo "[OK] 送信先が埋まっている"

exit 0
