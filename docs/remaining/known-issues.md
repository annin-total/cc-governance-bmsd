# 分かっていて片付いていないこと

事実や原因は分かっていて、直すか決めれば終わるもの。確かめることが残っているものは `unverified.md` にある。

## 回帰を検知するテストが無いもの

境界の 3 件は、境界のデータを共有フィクスチャへ足せば塞がる。取込の順序は、テストの作りを直す。

- コンテキスト分布の準拠の前後を分ける境界（準拠開始日ちょうどの行）
- 未導入者の判定における 30 日の窓
- 途絶えと見なす日数の境界
- CSV 取込の順序。`test_scan_three_files_order_independent` は置く順を変えるが、取込はファイル名順に整列するため、
  処理順の違いを検出できない

**完了条件** — 各項目で、境界や順序を壊した実装をテストが落とすことを確かめる。

## 採否が未決のこと

### `PostToolUse` / `PostToolUseFailure` / `PreCompact` / `UserPromptExpansion` の追加キー

実 stdin での列の充足は確認済み。契約に無い追加キー（`agent_type` / `duration_ms` / `tool_use_id` / `error` など）を
契約に採るかが決まっていない。

**完了条件** — 採否を決める。採るなら契約に足し、採らないなら理由を `../decisions/plugin.md` に記録する。

### CSV 取込で DB の例外が起きたとき

`_import_file_or_error` が捕まえるのは `ValueError`・`OSError`・`csv.Error` だけで、DB の例外では残りのファイルを
取り込まずに止まる。docstring の「他を止めない」と食い違う。

**完了条件** — 止めるか続けるかを決め、docstring か実装をそれに合わせる。
