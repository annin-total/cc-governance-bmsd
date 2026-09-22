#!/usr/bin/env bash
# governance/ を配布リポジトリの plugins/governance/ へ差し込む。
# 使い方: scripts/release.sh [配布リポジトリのパス]（既定 ../cc-marketplace-governance-bmsd）
# コミットも push もしない。差し込みが終わった状態で止め、人がコミットする。
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

DIST_REPO="${1:-../cc-marketplace-governance-bmsd}"
GOVERNANCE_SRC="governance"
PLUGIN_REL="plugins/governance"
PLUGIN_DST="${DIST_REPO}/${PLUGIN_REL}"

fail() {
  echo "[NG] $1"
  exit 1
}

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
