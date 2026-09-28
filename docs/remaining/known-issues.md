# 既知の課題

原因または事実が判明しており、修正か判断によって完了する課題。検証が必要な事項は `unverified.md` に置く。

## 回帰テストの不足

次の項目は、実装が壊れてもテストで検知できない。境界の 3 件は共有フィクスチャに境界のデータを追加し、取込の順序はテストの構成を見直して対処する。

- コンテキスト分布の準拠の前後を分ける境界（準拠開始日ちょうどの行）
- 未導入者の判定における 30 日の集計期間
- 途絶えと見なす日数の境界
- CSV 取込の順序（`test_scan_three_files_order_independent` は置く順を変えるが、取込はファイル名順に整列するため、
  処理順の違いを検出できない）
- 本体が丸ごと無視する `settings.json`（型違いのキー 1 つなど）で、hook の行が 0 件のままで `settings.json` のバイトが
  変わらないことを見る E2E が無い。上流が無視の条件を変えたときの合図になる
- `tests/fixtures/hook_inputs/` に、`command_source` が `userSettings` の行と `agent_id` 付きの行が無い。`agent_id` の抽出は
  常に None の入力でしか確かめていない（`scripts/sanitize_fixtures.py` で採り直す）

**完了条件** — 各項目について、境界・順序・抽出を壊した実装でテストが失敗することを確認する。
`settings.json` の E2E は、本体が読める `settings.json` に替えると失敗することを確認する。

## 未決の判断

### `PostToolUse` / `PostToolUseFailure` / `PreCompact` / `UserPromptExpansion` の追加キー

実 stdin での列の充足は確認済みである。契約に無い追加キー（`agent_type` / `duration_ms` / `tool_use_id` / `error` など）を
契約に含めるかは未決定である。

**完了条件** — 採否を決定する。採用する場合は契約に追加し、採用しない場合は理由を `../decisions/plugin.md` に記録する。

### CSV 取込における DB 例外の扱い

`_import_file_or_error` が捕捉するのは `ValueError`・`OSError`・`csv.Error` のみであり、DB の例外が発生すると
残りのファイルを取り込まずに停止する。docstring の「他を止めない」と一致しない。

**完了条件** — 停止と継続のどちらとするかを決定し、docstring または実装をそれに合わせる。

### `config.json` が無いときの送信プロセス

`config.json` が無いと `queue.jsonl` が上限なしに増える（`../spec/plugin.md` の「蓄積と送信」）。壊れた JSON は
`scripts/validate_plugin.py` が配布前に止めるので、残るのはファイルが無い場合である。今の挙動は
`tests/plugin/client/test_sender.py` の `test_missing_config_file_is_silent` が固定している。

**完了条件** — 無いときも退避と破棄を行うかを決定し、行うなら実装とテストを直し、行わないなら理由を `../decisions/plugin.md` に記録する。
