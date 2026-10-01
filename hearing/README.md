# hearing-cost 配布手順

Claude Code の履歴から利用の重さをおおまかに推定し、ヒアリング調書を作るスキル。配布物は `skills/hearing-cost/` だけ。この README・`DESIGN.md`・`eval/` は配布しない。

## コピー先
`~/.claude/skills/hearing-cost/SKILL.md` になるように置く。`hearing-cost/hearing-cost/` と 1 階層余分にしない。

macOS / Linux:
```bash
mkdir -p ~/.claude/skills && cp -R skills/hearing-cost ~/.claude/skills/
```
Windows (PowerShell):
```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse -Force skills\hearing-cost "$HOME\.claude\skills\"
```

## 使い方
- `/hearing-cost`（既定は直近 30 日）
- `/hearing-cost 14`（日数）
- `/hearing-cost 2026-09-01..2026-09-30`（期間）
- `/hearing-cost cleanup`（終了時に作業フォルダの削除を提案）

Python 3 が必要（`python3`・`python`・`py -3` のいずれか）。調書は作業ディレクトリのルートに 1 ファイル置かれる。サブエージェントは軽量モデルを指定することがある。

## 権限の目安
スキル側は承認を求める仕組みを持たない。事前許可を使うかは利用者環境の自由。`settings.json` の断片例:
```json
{ "permissions": { "allow": [
  "Bash(python3 *collect.py*)",
  "Bash(python *collect.py*)",
  "Bash(py -3 *collect.py*)",
  "Write(/tmp/**)"
] } }
```
一時フォルダの場所は OS で異なる（Windows は `%TEMP%` 配下など）。環境に合わせて直す。

## 更新
新しい版を取得し、同じ場所へコピーし直す（上のコマンドを再実行）。

## 調書の送付
利用者が内容を確認・修正して、自分で送る。スキルは送信しない。
