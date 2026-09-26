# hook 入力の fixture を作り直す手順

Claude Code が hook に渡す stdin を採取し直し、無害化して `tests/fixtures/hook_inputs/` を作り直す手順である。
上流の仕様を調べるために stdin を見たいときも、1 の採取だけを使う。

## 1. stdin を採取する

隔離した `CLAUDE_CONFIG_DIR` の `settings.json` の `hooks` に、採取したいイベントごとに 1 エントリを足し、
`claude` を操作する。保存先は `.gitignore` 済みの `scripts/captured/` にする。

```json
{ "hooks": { "PreCompact": [ { "matcher": "*", "hooks": [ { "type": "command",
  "command": "CAPTURE_DIR=\"<repo>/scripts/captured\" python3 \"<repo>/scripts/capture_hook_stdin.py\" PreCompact" } ] } ] } }
```

仕込むときの罠:

- **`CAPTURE_DIR` は `command` 文字列の中に書く。**hook エントリに `"env"` を付けると、そのエントリが無音で無効になる。空白を含むパスは壊れる
- **`PostToolUse` / `PostToolUseFailure` は `"matcher": "*"` が無いと発火しない**
- **1 つの matcher ブロックに複数コマンドを並べると、2 番目以降は実行されない。**イベントごとにブロックを分ける
- `settings.json` の hooks が `claude -p` で発火しないことがある。そのときはマーケットプレイスのコピーの `hooks/hooks.json` に仕込む（反映には cache の削除が要る）

## 2. 無害化して fixture を作り直す

```
python3 scripts/sanitize_fixtures.py scripts/captured
```

**書き込み先は `tests/fixtures/hook_inputs/` に固定で、実行のたびに空にしてから書き直す。**
採取先を間違えると既存の fixture が消える。実行前に、採取先に必要なイベントの stdin が揃っていることを確かめる。

作り直したら `pytest -q tests` を流し、差分を確かめてからコミットする。
