# Mods の導入

Claude Code の Mods（関数フック）を、本プラグインの画面とコマンドに限って足す作業。
上流の挙動は `../knowledge/claude-code-behavior.md` の「Mods（関数フック）」にあり、ここでは繰り返さない。
機能ごとの対応表と検証の一次記録は `spikes/mods-feasibility/FEASIBILITY.md` と `spikes/mods-feasibility/reports/` にある（リポジトリのルートからのパス）。

**完了条件** — 下の方針で mod を実装して配り、採った範囲・採らなかった範囲と理由を `../decisions/plugin.md` に記録すること。

## 方針

収集・送信・設定の自動適用は、今の command hook と同梱の Python のまま残す。mod には、本体のプロセスの中でしかできないことだけを置く。

- **mod に置くもの**
  - お知らせ: 未読をすべてプロンプトの上のバンドに並べ、各お知らせにリンクと「既読にする」ボタンを付ける。ブラウザを自動で開く機能と、
    `SessionStart` の `systemMessage` でのお知らせは消す。`notices.json` に任意の `label` を足す。`-p` では `$.ui.log` で出し、既読にしない
  - 再適用: mod のコマンド `/governance-reapply`。モデルを呼ばず、同梱の Python（今の再適用の処理）を起動して結果を出す
- **Python に残すもの**: 契約の全行（event・policy・error）、送信、設定の自動適用、識別子、状態行（`statusLine` と `statusline.js`）

理由:

- 収集を mod に移しても Python は残り（送信・設定の自動適用）、実装とテストが TypeScript と Python の二本立てになる
- 今の契約の列は command hook で全部取れている。独自イベントで取ると、`prompt_id`・`permission_mode` を transcript から読んで行を保留する処理が要る
- mod でしか取れない値は、この組織の環境では効果が小さい（費用は AI Gateway の CSV が正確で、レート制限は Bedrock では入らない）。
  hook の入力と状態行の入力で取れる値は多い
- Python の起動の待ち時間は、command hook の `"async": true` で本体から外せる見込みがある（未検証）
- 上流は command hook を非推奨にしておらず、早期アクセスとして版ごとに変わりうるのは mod の側である

## 境界の規則

- 契約の行を組み立てて積むのは Python だけ。mod でしか取れない値を将来足すときも、mod は観測値をファイルに書き出すだけにし、行にするのは Python にする
  （契約の正本を `contract.py` の 1 か所に保ち、TypeScript への生成を要らなくする）
- ファイルごとに書き手を 1 つにする。お知らせの既読は mod だけが書く
- mod から Python を起動するのは再適用の 1 か所だけ
- mod が読み込まれない・止まった端末でも、失うのはお知らせと再適用のコマンドだけで、収集・送信・設定の自動適用は動く

## 採らないこと

- 収集・送信・設定の自動適用を mod に移すこと（理由は上の「方針」）
- 握り潰しへの対策（`prependPlugins` への追加、tier の検知、守りの mod）。受け入れる限界として `../decisions/plugin.md` に記録した
- mod からの自動同期（`claude plugin update` と `/reload-plugins`）。本体の自動更新で次の起動から新しい版が効く

## 配布とリリース

- 社内のリポジトリに ssh の scp 形式（`git@<ホスト>:<パス>`）で登録する git 型。`../guide/onboarding.md` の登録手順を直す
- リリースの検査で、版の上げ忘れと `notices.json` の誤り（id の重複、url・label の形）を止める

## 未検証事項

| 事項 | 確かめること |
| --- | --- |
| `/clear` の後 | バンドが描き直されるか（`$.state` は消え、`session.start` は再発火しない） |
| Windows（リリースの前） | `$.process.run` から同梱の Python を起動できるか。`$.store` の保存先 |
| 配布（社内のリポジトリ） | user の範囲で導入したとき、自動更新で次の起動から新しい版になるか（実装後の E2E で会社 PC で確かめる） |
