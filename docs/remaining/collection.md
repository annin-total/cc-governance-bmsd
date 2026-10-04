# 収集の拡張

収集の待ち時間と、契約に足す項目の検討。Mods の導入（`mods.md`）とは独立に進める。

## 収集の hook の非同期化

収集の command hook に `"async": true` を付け、Python の起動の待ち時間を本体から外せるかを確かめる。上流の仕様は `../knowledge/claude-code-behavior.md`。

**確かめること** — `claude -p` の終了時に止められた非同期の hook が、送信待ちのファイルに途中までの行を残さないか。
件数が同期のときと一致するか。`systemMessage` を返す hook（`SessionStart`）は、非同期にすると利用者に表示されなくなるので対象から外す。

**完了条件** — 付けるかを決め、付けるなら実装して E2E で件数を確かめる。付けないなら理由を `../decisions/plugin.md` に記録する。

## 契約に足す項目

個人情報のリスクが低く、利用の分析に役立つ値を、1 つずつ採否を決める。収集の範囲で採らないと決めたことは `../decisions/plugin.md` の
「採らないと決めたこと」にあり、条件の付いた候補はその「条件が変われば再検討すること」にある。蒸し返すときは、新しい事実か当時の理由の弱さを示す。

候補（hook の入力と状態行の入力で取れる。いずれも Bedrock で値が入るかは未検証）:

- ツールの所要時間（`PostToolUse`・`PostToolUseFailure` の `duration_ms`）
- 失敗の種別（`StopFailure` の `error`）、セッションの終わり方（`SessionEnd` の `reason`）
- 許可待ち（`Notification` の `notification_type`）、許可の要求と拒否（`PermissionRequest`・`PermissionDenied`）
- 状態行の入力の値（変更した行数、コンテキストの使用率、モデル、キャッシュの効き具合）。状態行は対話の画面でしか動かない

**完了条件** — 候補ごとに、採るなら契約と仕様に入れ、採らないなら理由を `../decisions/plugin.md` に記録する。
