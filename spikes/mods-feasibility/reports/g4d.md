# g4d 報告: UI 系（お知らせ・状態行・/reapply）の Mods 実機検証

- 対象: Claude Code 2.1.288、macOS、隔離 `CLAUDE_CONFIG_DIR=$S/cfg`、未ログイン、`--plugin-dir`。実施 2026-10-03
- mod とスクリプト: worktree `spikes/mods-feasibility/g4d/`（commit 5efb439）。mod は `g4d-ui`（プラグイン名 `governance`。方式は環境変数 `G4D_MODE` で選ぶ）、比較用は `g4d-cmp`（今の `_format_message` と同じ書式で SessionStart の `systemMessage` を出す command hook）
- 生データ: `$S/cap/*.txt`（capture-pane -p）・`*.ansi`（-e）、`$S/logs/*.debug.log`・`p*.out`・`p*.err`
- お知らせのデータは未読 2 件（1 件目は url つき・本文に改行 3 つ、2 件目は url なし）

## 1. お知らせ

### 今の見え方（systemMessage、比較用、160 列）

```
  ⎿  SessionStart:startup says: 設定を自動で適用しています
     本部の方針により、Claude Code の自動圧縮のタイミングと、…自動で設定しています。
     上書きしても次回のセッション開始で元に戻ります。
     ご質問は情報システム部門までご連絡ください。
     詳細: https://example.com/governance/notice?id=1&lang=ja
     利用ログの送信について
     利用状況（回数とトークン数）を集計のため送信しています。プロンプトの本文は送りません。
```
transcript に残り続ける。改行も項目間の空行も保たれる（抜粋は空行を省いた。生テキストは cap/i9b-80.txt）。この長さでは退避は起きなかった。

### (a) `$.ui.toast`（session.start でも classic.SessionStart でも出る）

```
╭──────────────────────────────────────────╮
│ governance                               │
│ [toast] 設定を自動で適用しています�本部  │
│ の方針により、Claude Code の自動圧縮のタ │
│ イミングと、配布経路（マーケットプレイ…  │
╰──────────────────────────────────────────╯
```
- 右上に 42 列ほどの固定幅の箱。**本文は 3 行で切られ「…」**。**改行は U+FFFD（`ef bf bd`）で描かれる**（cap/i1-toast-2）
- 起動直後（t+1 秒）から出て、t+5 秒で消えた（既定 4000ms どおり）。画面ができる前に呼んでも消えない
- 80 列でも同じ箱（cap/i9-t2）。transcript に残らない
- 判定: お知らせ本体の代わりにはならない（後退）。「お知らせ N 件」の合図にだけ使える

### (b) `$.ui.log`（transcript）

```
⏺ governance: [log] 設定を自動で適用しています�本部の方針により、…セッ
  ション開始時に自動で設定しています。�上書きしても…�詳細: https://examp
  le.com/governance/notice?id=1&lang=ja��利用ログの送信について�利用状況…
```
- transcript に残る 1 行（淡色）。**改行は U+FFFD**。行頭に `governance:`。URL は折り返しで分断される
- 判定: 内容は全部見えるが、今より読みにくい（改行が潰れる）。項目ごとに 1 回ずつ呼べば改行の問題は小さくなる（推測、未検証）

### (c) AbovePrompt のバンド（Link・既読ボタン）

160 列（cap/i2-start）:
```
╭─────────────────────────────────────────────────────────────────────[-]
│ 設定を自動で適用しています                                              │
│ 本部の方針により、…セッション開始時に自動で設定しています。            │
│ 上書きしても次回のセッション開始で元に戻ります。                        │
│ ご質問は情報システム部門までご連絡ください。                            │
│ 詳細を開く                                                              │
│ 利用ログの送信について                                                  │
│ 利用状況（回数とトークン数）を集計のため送信しています。…               │
│ [ 既読にする ]                                                          │
╰─────────────────────────────────────────────────────────────────────────╯
```
80 列（cap/i9b-80）も同じ形で、本文は枠内で折り返す。
- 改行はそのまま描かれる（`Text` の中の `\n`）。プロンプトのすぐ上に、既読にするまで出続ける
- `Link` は OSC 8 で出る: `ESC]8;id=…;https://example.com/governance/notice?id=1&lang=ja` … `ESC]8;;`（cap/i2-start.ansi）。表示は label の「詳細を開く」だけで URL は見えない
- ctrl+x tab → `r`（hotkey）で `$.store` に `{"seen":["g4d-1-policy","g4d-2-short"]}` が書かれ、バンドが消えた。再起動後も出ない（cap/i3-band-seen）
- 判定: 同等以上。改善案は成り立つ

### (d) Pane（頼まれずに開く）

- 160 列: `{"isPlaced":true}`。右側にドッキングして表示（cap/i4-pane160）。Markdown の太字見出し・Link・「既読にして閉じる」ボタン。ctrl+x tab → `r` で既読が書かれ、ペインが閉じた（i5b）
- 80 列: `{"isPlaced":false,"reason":"unasked below 144 columns (80 now): placed when the person opens it, or when the termi…"}`。**画面には何も出ない**（cap/i5b-pane80）。`tmux resize-window -x 160` で広げると、その時点で配置された（cap/i5b-widened）
- 判定: 144 列未満では無言で見えない。単独では後退。バンドかトーストと組み合わせる前提なら使える

### (e) その他

- `$.session.append`（`type: 'system'`）: 戻り値は成功（`name: "informational"`）で transcript の jsonl に `system/informational` として保存されるが、**画面には描かれなかった**（i9・i10、スクロールバックを含めて 0 件）。stream-json にも出ない
- `InfoNotice`: 型の上では既存のロゴ下の通知を書き換えるだけで、新しく足す手段が無い（型 L9495）。試していない
- `PromptHint`: `hint` の書き換えでプロンプト下の行に `· お知らせ未読 2 件 (ctrl+x tab で既…` を足せた（80 列では末尾が切れる）。`tail` だけを足す書き方では何も出なかった（auto mode の表示行のとき）
- `Markdown` 要素: ペインと command 出力で表が描けた（下記 /reapply）

## 2. `-p` での扱い

| 方式 | text / json の stdout・stderr | stream-json |
|---|---|---|
| systemMessage（今） | 出ない | `hook_response` の output |
| toast（session.start） | 出ない | `{"type":"system","subtype":"ui_toast","plugin":"governance","text":…}` |
| toast（classic.SessionStart） | 出ない | **出ない**（p7） |
| ui.log | 出ない | `subtype:"ui_log"` |
| ui.status | 出ない | `subtype:"ui_status"` |
| ui.open（ペイン） | 出ない | `subtype:"ui_panes"`（id・title だけ。中身は出ない）。`isPlaced:true` |
| バンド | 出ない（`ui.render` が発火しない） | 出ない |
| session.append | 出ない | 出ない |

- 判定材料: `-p` では `CLAUDE_CODE_ENTRYPOINT=sdk-cli`、`session.start` の `isInteractive=false`・`surface=null`。対話では `cli`・`true`・`terminal`。両者は一致した
- `isInteractive` が偽のとき既読にしない実装で、`-p` 後も store の seen は空のままだった（p7）
- 今の「stream-json の hook_response に出る」に当たるのは `ui_log`（や `ui_toast`）

## 3. ブラウザ起動の代替

- `$.process.run(['open', url])` は PATH を引く: PATH 先頭の偽 `open` が呼ばれた（`open -h` を先に呼んで確かめてから URL を渡した）
- 引数は分断されずに 1 つで届いた: `https://example.com/governance/notice?id=1&lang=ja`
- 所要: 対話で 21〜30ms（偽 `open` は即終了）。`-p` の初回は 627ms（理由は調べていない）
- 既読にした後の再起動では呼ばれなかった（i8）
- Link（OSC 8）は出る。押したときにブラウザが開くかは、tmux では確かめられない（未検証）
- 推測: 本物の macOS `open` は LaunchServices に渡して即座に終わるので待たない。ただし型の注記どおり、子が出力を持ち続けると `run` は timeout まで待つ

## 4. 状態行

- `$.ui.status` は 2.1.288 でも `⚠ governance: …` と行頭に ⚠ とプラグイン名が付き、色は `ESC[38;5;220m`（黄）。置き場所はプロンプト枠の下、statusLine の上:
```
❯
────────────────────────────────────────────────
  ⚠ governance: claude-opus-5-5 | ws | ctx -% (-/1000000) · $0.00 | git rc=128
  Opus 5.5 (medium) | ws | session 0k
  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents
```
- 今の statusLine（`--settings` の `statusLine`、`plugin/statusline/statusline.js`）は mod と併存して描かれた。**未ログインでも描かれる**（色 `38;5;246`）。ただし初回は起動の約 7 秒後（debug `StatusLine … completed with status 0`）
- mod での再現（statusline.js の各項目）:
  - モデル: `$.session.model()` は id（`claude-opus-5-5`）。表示名（`Opus 5.5`）を返す API は型に無い
  - effort: session の API に無い。`turn.start` の `e` にはある（型 L4177、未検証）
  - cwd: `$.session.cwd()` で取れる
  - ctx%・used/window: `$.session.usage().context`（percent・tokens・window）。未ログインでは percent・tokens が無い
  - session（入出力の累計）: 型に無い。`turn.complete` の usage を足せば作れる（推測）
  - edit (+a, -r): 型に無い
  - git のブランチ・差分: `$.process.run(['git', …])` で取れる（ここは非リポジトリで rc=128）
- 判定: `$.ui.status` は ⚠・黄・接頭辞が付き、statusLine の代わりにならない。statusLine は settings のまま残すのが前提

## 5. `/reapply` を mod のコマンドにする

- **名前空間は付かない。**登録名 `reapply` は `/reapply` で出る（init の slash_commands に `reapply`）。`/governance:reapply` と打つと `Unknown command: /governance:reapply`。`name: 'governance:reapply'` は「letters, digits, _ or -」で拒否
- **同名のスキルと衝突する。**同じプラグインに `skills/reapply` があると `"/reapply" refused: it is the plugin's /governance:reapply`。**別プラグインの `reapply` スキルでも** `refused: it is the plugin's /g4d-cmp:reapply` になり、`/reapply` はそのスキルへ行ってモデルを呼ぶ。register は例外を投げるので、捕まえないと session.start の残りが止まる（p1）
- 補完: `/reap` で `/reapply  g4d: 標準設定の再適用（偽）`。`/governance:` では何も出ない
- 描画: `{ text }` はそのまま（`governance: ` の接頭辞つき、表は生の `|`）。`CommandOutput` を `Markdown` で描くと罫線の表になる。ただし接頭辞が 1 行目に入るので、表の前に 1 行と空行を置く必要がある:
```
┌──────────────────┬───────────────────────────────────────┐
│       結果       │                 項目                  │
├──────────────────┼───────────────────────────────────────┤
│ applied          │ env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE   │
…
└──────────────────┴───────────────────────────────────────┘
```
- `-p`: `num_turns=0`。`exitCode: 3` は **text と json では rc=3、stream-json では rc=0**（2 回ずつ再現）。`-p` の text 出力は `governance: ` 接頭辞つきの生テキスト

## 6. 改善候補の判定

| 候補 | 判定 | 根拠 |
|---|---|---|
| バンドで出し、既読ボタンで消す | 成り立つ（事実） | 改行・80 列とも読める。押すと store に書かれ以後出ない |
| ブラウザを勝手に開かず Link を置く | 表示は成り立つ（事実）。押して開くかは未検証 | OSC 8 が出る。URL 文字列は見えなくなる |
| ペイン | 144 列以上でだけ成り立つ（事実） | 80 列では無言で出ない |
| プロンプト下のヒントで未読数を出す | 成り立つ（事実） | `PromptHint` の `hint` の書き換え。狭いと切れる |
| `/reapply` の表を Markdown で描く | 成り立つ（事実） | 罫線の表になる。モデルを呼ばない |
| コンテキスト閾値でバンド警告（`session.measure`） | 未検証 | 未ログインでは対話の `session.measure` が発火しなかった（`-p` では起動時に `changed=context,cost`・percent 無しで発火） |

## 7. 同等にできるか（後退の有無）

- お知らせ: バンドなら同等以上。toast・ui.log・ペイン単独は後退（切れる・改行が潰れる・狭いと出ない）。append は出ない。`-p` では `ui_log` が hook_response の代わりになる。ブラウザ起動は `$.process.run(['open'])` で同じことができる（macOS のみ確認。Windows は未検証）
- 状態行: statusLine を settings に残せば後退なし。mod だけでは後退（⚠・黄・項目不足）
- /reapply: **名前が `/governance:reapply` から `/reapply` に変わる**（見え方の変更。ユーザー確認が要る）。他プラグインの同名スキルで登録できなくなるので、`governance-reapply` など衝突しにくい名前にするのが安全（推測）。stream-json で exitCode が効かない

## 8. 事実と推測の区別

上の各節で「推測」「未検証」と書いたもの以外は、capture-pane のテキスト・debug ログ・stdout/stderr で確かめた事実。

## 9. 未検証事項

- Desktop・VS Code・mobile の surface（バンド・ペイン・status・toast の描画、`isInteractive`・ENTRYPOINT の値）
- Link を押したときの挙動、本物の `open` の所要時間、Windows でのブラウザ起動
- ログイン下の `session.measure` とそれを使った警告、statusLine の ctx 系の値
- 長文の systemMessage がファイルへ退避される長さでの比較（今回の 2 件では退避されなかった）
- `tsc` による型検査（npx の取得が通信になるため実施せず。`claude plugin validate` は通過）
- ホットリロード時の session.start 再発火で toast・open が繰り返されるか（RESULTS では再発火する）

## 10. 検証中に起きたこと

- i4・i5 で起動直後に `1` が送信され、未ログインのため `Not logged in` で終わった。原因は自作 tui.sh の展開の誤り（`G4D_NOCMP=1` のとき `1` を位置引数で claude に渡していた）。debug では認証の解決に失敗してクライアント側で終わっている（`Could not resolve authentication method`）。修正後は再発なし
- 自作 mod の初版は、描画のフラグをモジュール変数に置いたため、`ui.render` が `session.start` より先に走るとバンドが出なかった（i9）。描画のたびに env を読むよう直した

## 11. 痕跡

- 子 claude・tmux（`-L gov4d`）は残っていない（pgrep で確認）。ソケット `/private/tmp/tmux-501/gov4d` は削除済み
- 本人の `~/.claude.json`: `g4d` を含む記述 0 件。`~/.claude/settings.json`: mtime・サイズとも開始前と同じ。`~/.claude/plugins/store/`: 開始前と同じ 2 ファイル。`~/.claude/projects` に g4d の項目なし
- 隔離側（`$S/cfg`）に store・transcript・`.claude.json`（onboarding 済み・フォルダ信頼）が残っている。scratch にあるので消してもよい
- worktree に本体が書いた `g4d-ui/.claude-plugin/types/`・`g4d-ui/tsconfig.json`（.gitignore 済み）
