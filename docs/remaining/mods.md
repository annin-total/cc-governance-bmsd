# Mods の採否

Claude Code 2.1.287 の Mods（関数フック）を本プラグインに採るかの検討事項。
上流の挙動は `../knowledge/claude-code-behavior.md` の「Mods（関数フック）」にあり、ここでは繰り返さない。
検証の一次記録は `spikes/mods-probe/RESULTS.md`（リポジトリのルートからのパス）にある。

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
- 本体の型定義は managed settings の hook が mod より上にあると書く（未検証）。成り立つなら、
  managed settings で配る hook は利用者の mod で止められない

**判断事項** — 次のどちらかを決める。

- 受け入れる限界として `../decisions/plugin.md` の「受け入れている限界」に記録する
- 対策を取る（下の「改善案・検討事項」の守りの mod、または managed settings の hook）

## 採用した場合に得られるもの

- transcript を解析せずにトークン数を得られる（`turn.complete` の `e.usage`）
- Python の外部プロセスなしで画面表示ができる（お知らせのトースト・状態行・プロンプト上の帯）
- 送信の定期実行を本体の中で回せる（`$.clock.every`。対話で予定どおりの間隔で発火した）
- 開発中はファイルの保存で読み直される
- `claude -p` でも、画面表示以外のイベントはすべて発火する

## 採用した場合の注意点

- `$.http.fetch` の例外を必ず捕まえる。捕まえないと「hook は標準エラーに何も出さない」という現行の原則が崩れる
- 拒否や判定には `.catch` を付け、外すと落ちるテストで固定する。`claude plugin validate` は見ない
- `$.store` は利用者ごとに 1 ファイルで、同じキーへの並行書き込みは更新を失う。キーをセッションごとに分けるなどの設計が要る
- `e.usage` はターンごとで、サブエージェントは別のターンとして届く。合計の取り方を契約で決める
- 利用者は mod を外せる（`disableAllHooks`、`enabledPlugins` の変更）。強制が要る制御は mod に置かない
- ディレクトリ型マーケットプレイスで配る限り、配布物に型定義などのファイルは書かれない
- 推測: 実装が TypeScript になり、開発環境（型検査・`claude plugin test`）とテストの作法が Python と二本立てになる

## 改善案・検討事項

1. **収集を `turn.complete` に寄せ、transcript の解析を減らす。** コンテキストトークン数を transcript 末尾から読む処理と、
   その取りこぼし（読み取り範囲・応答なし）が無くなりうる。サブエージェントの分を含めるかを先に決める
2. **お知らせと状態行を `$.ui` に寄せる。** ブラウザ起動や `statusline.js` の複製が要らなくなりうる。`-p` では表示されない
3. **守りの mod を置く。** 本プラグインが設定の自動適用で、利用者の `settings.json` の `prependPlugins` に守りの mod を書く。
   `next.to(e, 'append')` で利用者 tier の mod の握り潰しと本文の改変を防ぐか、`plugin.register` で classic hook に触れる mod の
   読み込みを拒否する。限界:
   - 利用者が `settings.json` を戻せば外れる（そのとき守りの mod は読み込みに失敗し、debug にだけ出る）
   - 利用者が別の mod を `prependPlugins` に書けば、`next.to` は並びに関係なく効かず、`plugin.register` は前に書かれた側が勝つ
   - classic hook を観測するだけの正当な利用者の mod も、見えなくなるか読み込めなくなる
   - managed settings がある端末での `prependPlugins` の扱いは未検証
   - 推測: 防げるのは不用意に入れた mod までで、意図的な回避は防げない
4. **mod と command hook を併用する（移行期）。** mod が `next(e)` を返す限り、既存の command hook は併走する
5. **`$.store` は並行を前提にキーを分ける。** セッションごとのキーに書き、送信時にまとめる

## 未検証事項（この Mac では確かめられない）

| 事項 | 確かめること |
| --- | --- |
| Bedrock の認証 | 会社 PC で mod が読み込まれ、`turn.complete` の `e.usage` に値が入るか |
| Windows | mod の読み込み・`$.store` の保存先・`$.http.fetch` が macOS と同じか |
| Desktop・VS Code・JetBrains | 各 surface で toast・状態行・`ui.render` が出るか |
| managed settings 下 | managed の `prependPlugins`・`allowManagedModsOnly`・`disableAllHooks` があるとき、利用者の `prependPlugins` と mod がどう扱われるか。managed の hook が mod に止められないか |
| git 型マーケットプレイス | 導入した mod が cache と元のどちらから実行されるか、型定義が書かれるか |
| `$.clock.every` | 長時間のセッションで発火し続けるか。読み直しの後に旧版のタイマーが残るか |
| 拒否された mod | `plugin.register` で拒否された mod のトップレベルのコードが実行されるか |
| `settings.json` の command hook | 守りの mod で、プラグインの command hook と同じく守れるか |
| 社内の受信先への fetch | 対話起動で、localhost 以外への `$.http.fetch` に許可確認が出るか |
