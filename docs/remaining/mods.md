# Mods の採否

Claude Code 2.1.288 の Mods（関数フック）へ本プラグインを移すかの検討事項。
上流の挙動は `../knowledge/claude-code-behavior.md` の「Mods（関数フック）」にあり、ここでは繰り返さない。
機能ごとの対応表・決めた方針の理由・設計の細部の未決は `spikes/mods-feasibility/FEASIBILITY.md`、
検証の一次記録は `spikes/mods-feasibility/reports/` と `spikes/mods-probe/RESULTS.md` にある（いずれもリポジトリのルートからのパス）。

**完了条件** — 採否と理由を `../decisions/plugin.md` に記録すること。採らない場合は「採らないと決めたこと」に記録する。
下の「現行設計への影響」の判断事項は、採否と別に決着させる。

## 現行設計への影響（採否と無関係に効く）

利用者が自分で入れた mod 1 つで、本プラグインの command hook（収集と、`SessionStart` での設定の適用）を
イベントごとに無言で止められ、command hook が受け取る本文も偽れる。端末側には痕跡が debug にしか残らず、
本プラグインの hook は自分が呼ばれなかったことを知りようがない。

- これまでも利用者は自分の `settings.json` で hook を止められた（`disableAllHooks` など）。mod で増えたのは、
  特定のイベントだけを選んで止められることと、本文を偽れること
- 推測: 収集が止まった端末は、サーバ側では途絶えとして見えうる。特定のイベントだけを止められた場合は、
  イベントの種類ごとの比率の偏りとしてしか現れない
- managed settings がある端末では、組み込みのガード（sec-default）が座り、command hook は利用者の mod に止められない
  （managed settings を模した policy の下での観測。本物の managed settings では未検証）

**判断事項** — 次のどちらかを決める。

- 受け入れる限界として `../decisions/plugin.md` の「受け入れている限界」に記録する
- 対策を取る（採る場合は下の「握り潰し」の方針。採らない場合は managed settings を置くか、managed settings で hook を配る）

## 採る場合の方針（設計で確定）

`FEASIBILITY.md` の「決定した論点」の要約。理由と残る未決はそちらにある。

- 段取り: 同等のまま移し、その後に改善する
- 収集: 独自イベント（`tool.call`・`turn.*`・`session.*`・`prompt.submit`・`command.run`）を土台にする。
  `prompt_id` と `permission_mode` は transcript の user 行から読み、行はターンの終わりまで保留する
- 送信: 今と同じ一括送信。送るのは切り離した Python で、mod は判定と起動だけを受け持つ
- 設定の自動適用: 同梱の Python が丸ごと行い、mod は起動と policy 行の組み立てだけを受け持つ
- お知らせ: プロンプトの上のバンドにリンクと既読ボタンを付けて出し、ボタンで既読にする。ブラウザ起動は残す。
  `-p` では `$.ui.log` で出し、既読にしない
- 状態行: settings の `statusLine` と `statusline.js` を残す
- 再適用: mod のコマンド `/governance-reapply`（モデルを呼ばない）
- 握り潰し: managed settings が無い端末では、governance を利用者 settings の `prependPlugins` に置き、守りの mod と検知を足す。
  ある端末では sec-default に任せる
- 受け入れる見え方の変化: Esc で中断したツールの `PostToolUseFailure` の行が増える。`claude_code_version` が全イベントに入る。
  mod が積む error 行の `error_type` が、抜き出した符号と JS の例外名になる

## 採否の前に詰めること

- 推測: 実装が TypeScript と Python の二本立てになり（送信と設定の自動適用は Python に残る）、開発環境とテストの作法も二本立てになる
- リポジトリの `CLAUDE.md` の Design 原則との両立: 契約の正本（`contract.py`）と mod の列・型をどう同期するか。
  transcript の user 行（本文を含む）から名指しのキーだけを取り、本文を保持・送信しないことをどう担保するか
- git 型で配ると、版を上げ忘れたリリースは端末に届かない。リリース手順で版の上げを検査するか
- Desktop など `$.process.run` が使えない面（型定義で CLI 限定）では、Python に残す送信と設定の自動適用、
  `user_email`・`host` の取得が動かない見込み（未検証）

## 採用した場合に得られるもの

- コンテキストトークン数と本体の版を、transcript を読まずに得られる（`$.session.usage().context.tokens`・`$.session.version()`。
  command hook の値と全件一致）
- お知らせを、既読にするまでプロンプトの上に出し続けられる
- 再適用でモデルを呼ばない
- 開発中はファイルの保存で読み直される
- `claude -p` でも、画面表示以外のイベントはすべて発火する

## 採用した場合の注意点

- `$` の呼び出しの例外を必ず捕まえる（`$.http.fetch` の失敗、`$.command.register` の名前の衝突など）。
  捕まえないと「hook は標準エラーに何も出さない」という現行の原則が崩れ、同じ hook の残りも止まる
- 拒否や判定には `.catch` を付け、外すと落ちるテストで固定する。`claude plugin validate` は見ない
- `$.store` は利用者ごとに 1 ファイルで、同じキーへの並行書き込みは更新を失い、合計が上限に達すると全キーが書けなくなる。
  キーをセッションごとに分け、大きいものを置かない
- 利用者は mod を外せる（`disableAllHooks`、`enabledPlugins` の変更）。強制が要る制御は mod に置かない

## 未検証事項（手動検証で確かめる）

この Mac で確かめられる未検証事項は `FEASIBILITY.md` の「未検証事項」にある。

| 事項 | 確かめること |
| --- | --- |
| 会社 PC（Bedrock） | 社内の実プロキシ・実 CA の下で送信が届くか（`CLAUDE_CODE_CERT_STORE` を含む）。利用者 settings の `prependPlugins` で governance が tier prepend になるか。Bedrock の下での transcript の `promptId`・`permissionMode`。`turn.step` の `effort` の出どころと、`classic.*` の `effort.level` との一致 |
| Windows | すべて。切り離した送信プロセスが本体の終了後に生き残るか（今の Python 版を含む）。`$.process.run` から同梱の Python を起動できるか。transcript を末尾から読む方法（`tail` が無い）。`hostname`・パス・`$.store` の保存先・ブラウザ起動。mod からの自動同期（パスの区切り、`claude` の実行ファイル） |
| 配布（社内 Bitbucket） | https での `marketplace add` が通るか（直接の登録は 150 秒待っても応答が無かった）。自動更新で実行される版が切り替わる条件（メッセージの送信の有無、`installed_plugins.json` の版と `installPath` で交絡を切り分ける）。mod からの自動同期と、並行したセッション・本体の autoUpdate との競合。社内リポジトリに届かないときと、clone 先が消えたときの起動と更新 |
| managed settings 下 | 本物の managed settings で sec-default が座り、届く範囲が模した policy と同じか。managed の `prependPlugins` で governance が tier prepend になり、利用者の `prependPlugins` が無視されるか。`allowManagedModsOnly`・`allowManagedHooksOnly`・`disableSideloadFlags` の効き方。managed の hook が利用者の mod に止められないか。組み込みや他の mod の `fs.*` hook が、利用者の `settings.json` への書き込みを拒否しないか |
| Desktop | バンドと既読ボタンが描かれるか、`isInteractive`・`CLAUDE_CODE_ENTRYPOINT` の値。`$.process.run` が使えるか。Link を押してブラウザが開くか（VS Code 拡張は対象外） |
