# 未検証事項

検証すれば結論が出る事項。既知の課題は `known-issues.md` に置く。

## 社内の端末でしか確かめられないこと

### 端末の Python の可用性

**確かめること** — 配布対象端末の構成の種類ごとに 1 台で `python3 --version` が応答すること。

**不合格だったとき** — 報告し、`../decisions/plugin.md` の「起動コマンドは `python3` のままにする」
判断を見直すかを決める。

### scp 形式に ref を付けた登録

**確かめること** — 社内リポジトリを `git@<ホスト>:<パス>#staging` の形で `claude plugin marketplace add` に渡して登録でき、
`staging` の版が導入されるか（`../guide/release.md` の「staging で確かめる」は `<owner>/<repo>#staging` と `https://…#staging` の形で書いている）。

**完了条件** — 結果を `../knowledge/claude-code-behavior.md` に記録すること。通らなければ報告し、staging の確かめ方を決め直す。

### Bedrock での E2E

**確かめること** — 会社 PC で Bedrock の認証を渡し、`pytest e2e` が要認証のモジュールを skip せずに通ること。

**完了条件** — 通ること。通らなければ、つまずいた点を `../guide/e2e.md` の「認証」に反映する。

### Windows 端末

開発機に Windows 端末が無い。

| 事項 | 確かめること |
| --- | --- |
| お知らせの mod | 対話でバンドが出て既読のボタンが効くか。`$.store` のファイルがどこに置かれるか |
| 起動時間 | hook の応答を体感できるほど遅らせないか |
| 収集と送信 | 並列の hook の追記で `queue.jsonl` の行が欠けないか。切り離した送信プロセスが Claude Code の終了後も送り切るか（`start_new_session` は POSIX でしか効かない） |
| E2E | `pytest e2e` が通るか。通らなければ、つまずいた点を `../guide/e2e.md` に反映する |

**完了条件** — 結果を `../knowledge/claude-code-behavior.md` に記録すること。不合格なら報告する。

## お知らせの mod の見え方

実機のターミナルで確かめる（tmux では確かめられない）。結果は `../knowledge/claude-code-behavior.md` に記録する。

| 事項 | 確かめること |
| --- | --- |
| リンク | バンドのリンクの文言を押して既定のブラウザが開くか（macOS の Terminal・iTerm2、Windows Terminal） |
| OSC 8 に対応しない端末 | URL が 2 回出るか（リンクの後の薄い URL と、本体が足す URL） |
| マウス | 全画面の描画で、実際の端末アプリ（Terminal・iTerm2・Windows Terminal）でもホイールでのスクロールとボタンのクリックが効くか |
| managed settings がある端末 | sec-default が座った端末で、利用者の mod に `ui.render` と `$.store` が届き、バンドが出るか |
| 入れ直し | アンインストールして入れ直したとき、`$.store` の既読が残るか |

**完了条件** — 各事項の結果が記録されていること。押しても開かない・崩れるなら報告する。

## ローカルの隔離環境で再現すれば白黒が付くこと

| 事項 | 確かめること |
| --- | --- |
| `effort.level` | `claude -p` では、モデルが effort に対応するときだけ現れることを確認済み。**対話モードでは未検証**（自動操作が初回オンボーディングを突破できない） |
| detach した送信プロセスが確実に走るか | 手動で `_sender.py` を叩くと即座に送信される一方、`claude -p` 終了後に queue が残留する現象を独立した 2 回の検証で観測した。**条件が未特定。**連続実行の間隔・並列度を変えて切り分ける |
| `rotate` と追記の競合で行が失われるか | hook が `queue.jsonl` を開いてから書くまでの間に送信プロセスが退避すると、行は退避先のファイルに追記される。送信プロセスがそのファイルを読んだ後なら、2xx で消すときに行が失われる（推定）。追記と退避を競合させて行が欠けるかを確かめる |
