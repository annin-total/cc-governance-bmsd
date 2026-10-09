# 既知の課題

原因または事実が判明しており、修正か判断によって完了する課題。検証が必要な事項は `unverified.md` に置く。

## 回帰テストの不足

次の項目は、実装が壊れてもテストで検知できない。集計期間の境界は共有フィクスチャに境界のデータを追加して対処する。

- 未導入者の判定における 30 日の集計期間
- 本体が丸ごと無視する `settings.json`（型違いのキー 1 つなど）で、hook の行が 0 件のままで `settings.json` のバイトが
  変わらないことを見る E2E が無い。上流が無視の条件を変えたときの合図になる
- `tests/fixtures/hook_inputs/` に、`command_source` が `userSettings` の行と `agent_id` 付きの行が無い。`agent_id` の抽出は
  常に None の入力でしか確かめていない（`scripts/sanitize_fixtures.py` で採り直す）

**完了条件** — 各項目について、境界・抽出を壊した実装でテストが失敗することを確認する。
`settings.json` の E2E は、本体が読める `settings.json` に替えると失敗することを確認する。

## 未決の判断

### `PostToolUse` / `PostToolUseFailure` / `PreCompact` / `UserPromptExpansion` の追加キー

実 stdin での列の充足は確認済みである。契約に無い追加キー（`agent_type` / `duration_ms` / `tool_use_id` / `error` など）を
契約に含めるかは未決定である。

**完了条件** — 採否を決定する。採用する場合は契約に追加し、採用しない場合は理由を `../decisions/plugin.md` に記録する。

### `config.json` が無いときの送信プロセス

`config.json` が無いと `queue.jsonl` が上限なしに増える（`../spec/plugin.md` の「蓄積と送信」）。壊れた JSON は
`scripts/validate_plugin.py` が配布前に止めるので、残るのはファイルが無い場合である。今の挙動は
`tests/plugin/client/test_sender.py` の `test_missing_config_file_is_silent` が固定している。

**完了条件** — 無いときも退避と破棄を行うかを決定し、行うなら実装とテストを直し、行わないなら理由を `../decisions/plugin.md` に記録する。
