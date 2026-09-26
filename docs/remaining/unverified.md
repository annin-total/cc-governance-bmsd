# 未検証のまま残っていること

確かめれば白黒が付くものと、採否が未決のもの。

## 社内の端末でしか確かめられないこと

### 端末の Python の可用性

**確かめること** — 配布対象端末の構成の種類ごとに 1 台で `python3 --version` が応答すること。

**不合格だったとき** — 報告し、`../decisions/plugin.md` の「起動コマンドは `python3` のままにする」
判断を見直すかを決める。

### Bedrock での E2E

**確かめること** — 会社 PC で Bedrock の認証を渡し、`pytest e2e` が要認証のモジュールを skip せずに通ること。

**完了条件** — 通ること。通らなければ、つまずいた点を `../guide/e2e.md` の「認証」に反映する。

### Windows 端末

開発機に Windows 端末が無い。

| 事項 | 確かめること |
| --- | --- |
| `CLAUDE_CODE_ENTRYPOINT` の値 | 対話起動・`claude -p` それぞれで macOS と同じ `cli` / `sdk-cli` になるか |
| `os.startfile` | 既定ブラウザが実際に開くか。コンソール窓が一瞬でも出ないか |
| 起動時間 | hook の応答を体感できるほど遅らせないか |
| 収集と送信 | 並列の hook の追記で `queue.jsonl` の行が欠けないか。切り離した送信プロセスが Claude Code の終了後も送り切るか（`start_new_session` は POSIX でしか効かない） |
| E2E | `pytest e2e` が通るか。通らなければ、つまずいた点を `../guide/e2e.md` に反映する |

**完了条件** — 結果を `../knowledge/claude-code-behavior.md` に記録すること。不合格なら報告する。

## 回帰を検知するテストが無いもの

境界のデータを共有フィクスチャへ足せば塞がる。

- コンテキスト分布の準拠の前後を分ける境界（準拠開始日ちょうどの行）
- 未導入者の判定における 30 日の窓
- 途絶えと見なす日数の境界

## まだ観測されていない値

| 事項 | 確かめること |
| --- | --- |
| VS Code 拡張・デスクトップアプリ・JetBrains での `CLAUDE_CODE_ENTRYPOINT` | それぞれの値と、`systemMessage` が画面に表示されるかを確かめ、`../knowledge/claude-code-behavior.md` に記録する。表示されないなら、既読にしない判定を足すかを決める |

## ローカルの隔離環境で再現すれば白黒が付くこと

| 事項 | 確かめること |
| --- | --- |
| `effort.level` | `claude -p` では、モデルが effort に対応するときだけ現れることを確認済み。**対話モードでは未検証**（自動操作が初回オンボーディングを突破できない） |
| detach した送信プロセスが確実に走るか | 手動で `_sender.py` を叩くと即座に送信される一方、`claude -p` 終了後に queue が残留する現象を独立した 2 回の検証で観測した。**条件が未特定。**連続実行の間隔・並列度を変えて切り分ける |

## 採否が未決のこと

### `PostToolUse` / `PostToolUseFailure` / `PreCompact` / `UserPromptExpansion` の追加キー

実 stdin での列の充足は確認済み。契約に無い追加キー（`agent_type` / `duration_ms` / `tool_use_id` / `error` など）を
契約に採るかが決まっていない。

**完了条件** — 採否を決める。採るなら契約に足し、採らないなら理由を `../decisions/plugin.md` に記録する。
