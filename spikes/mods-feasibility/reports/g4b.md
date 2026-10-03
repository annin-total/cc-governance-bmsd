# g4b: 蓄積と送信を Mods で置き換えられるか（実機検証）

- 対象: Claude Code 2.1.288（macOS、本体は Bun/1.4.3。受信器が受けた User-Agent で確認）。隔離 `CLAUDE_CONFIG_DIR=<scratch>/g4b/cfg`、未ログイン、モデル呼び出し 0 回
- mod: `spikes/mods-feasibility/g4b/mod/`（`--plugin-dir` で読み込み。実行は scratch に置いたコピーから）。受信器 `recv.py`、切り離す送信スクリプト `sender.py`、起動スクリプト `cc.sh`（-p）・`tui.sh`／`iend.sh`（tmux -L gov4b の対話）
- 記録: `<scratch>/g4b/runs/<run>/debug.log`（mod の行は `g4b[<世代>]` で始まる）、受信器の記録 `runs/e*/recv-*.jsonl`（1 POST につき 1 行。content_length・received・sha256・ヘッダ・応答の成否）

## 判定の一覧

| # | 項目 | 判定 | 要点 |
|---|---|---|---|
| 1 | 終了時の送信 | 条件付き | 既定の 1.5 秒では「応答の遅い受信先」や「重い端末」で打ち切られる。**`CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` で上限を延ばせ、mod が session.start で `$.env.set` しても効く**。打ち切られても localhost では本文は受信器に全部届いていた（送った側は失敗と見なす → 再送で二重になる） |
| 2 | 応答しない受信先 | 条件付き（自前の timeout は作れる） | 本体に 30 秒の上限がある（`aborted: no complete answer within 30000ms`）。command では対話のターンが最長 30 秒止まる（Esc で `user-cancel` に）。`$.clock.after` ＋ `Promise.race` で自前の timeout は効くが、**打ち切った fetch の接続は裏で残り、30 秒の上限で閉じる**。タイマーから投げた fetch はターンを止めない |
| 3 | 切り離した送信 | macOS では同等にできる。Windows は未検証（不確か） | `$.process.run(['sh','-c','nohup python3 sender.py … >/dev/null 2>&1 </dev/null &'])` は 44〜61ms で戻り、-p でも対話でも、本体の終了後に子（PPID=1）が POST し 2xx でファイルを消した。**標準出力を閉じないと、子が終わるまで run が戻らない** |
| 4 | 失敗の区別 | 条件付き | `error.name` は常に `HooksError`、`code` などのプロパティは無い。message の `failed: <CODE>:` から区別はできる（ECONNREFUSED・ENOTFOUND・DEPTH_ZERO_SELF_SIGNED_CERT・EPROTO）。HTTP エラーは例外でなく `ok:false`。**message には URL が入る**ので、送るのは抜き出した符号だけにする |
| 5 | キューの置き場 | 同等にできる（ファイルの分割が前提） | 3 プロセス並行 × 300 回: `$.store` のセッション別キー 900/900、`$.fs.write` のセッション別ファイル 900/900。対照の共有キーは 316/900（消える）。上限超えは reject で既存の値は残る。list・stat で名前順と mtime の判定ができる。削除は `$.store.delete`・`$.process.run(['rm',…])` で可、`$.fs.write` は空にするだけ |
| 6 | 認証ヘッダと本文 | 同等にできる | `Content-Type: application/x-ndjson`・`X-Ingest-Token` が届く。ASCII 以外を含む本文（300 KB〜3 MB、15 件）が全件 sha256 一致で UTF-8 のバイト列として届いた |
| 7 | 定期送信とホットリロード | 同等にできる（対話のみ） | 3 秒周期で 2 回リロードしても、旧世代のタイマーは止まり、新世代だけが送った（二重なし） |
| 8 | 既存の状態の引き継ぎ | 同等にできる（4 MiB 以下なら） | `$.env.get('CLAUDE_CONFIG_DIR')` からパスを組み立てて `queue.jsonl`・`spool/` を読めた。mod には `CLAUDE_PLUGIN_DATA` が無い（undefined）。marketplace 名は自分で埋め込む必要がある |

## 1. 終了時の送信（事実）

-p（`/g4b ping` で session を起こして終わらせる。`G4B_END=send`）。ms は fetch の開始から完了・例外まで。

| 遅延 | 300 KB | 1 MB | 3 MB |
|---|---|---|---|
| 0 秒 | 200（136ms） | **打ち切り**（1921ms。下記） | 200（58ms） |
| 1 秒 | 200（1154ms、残り 340ms） | 200（1017ms） | 200（1054ms） |
| 3 秒 | 打ち切り（1524ms） | 打ち切り | 打ち切り |

対話（tmux で `/exit`）: 0 秒・1 MB は 200（143ms、終了まで 0.91 秒）、1 秒・3 MB は 200（1207ms、残り 228ms、終了まで 2.04 秒）、3 秒・1 MB は打ち切り（終了まで 2.26 秒）。reason は -p で `other`、対話で `prompt_input_exit`。

- 遅延 0 秒・1 MB の打ち切りは、並行する他の検証で端末が重かった回（この実行は全体で 12 秒かかった）。fetch の発行（debug 10:24:32.660）から受信器の着信（10:24:34.294）まで 1.6 秒かかり、着信の前に上限（10:24:33.756 `cut at the SessionEnd bound`）を過ぎた。**遅延のない受信先でも、端末の負荷次第で 1.5 秒を超える**
- 打ち切りの例外: `HooksError`・`g4b: $.http.fetch(<URL>) failed: The operation timed out.`。debug に `[WARN] session.end (<reason>): cut at the SessionEnd bound, the session ends regardless`
- **打ち切られたときの受信器の側**: すべての回で本文は全部届いた（received == content_length、sha256 一致）。応答の書き込みは `BrokenPipeError` か、カーネルのバッファに入って `sent` になる。つまりサーバは取り込み、端末は失敗と見なしてファイルを残す → 次回に再送 → 同じ行が二度届く（サーバの `event_id` 一意化が前提。今の C11 と同じ）。ただしこれは localhost で本文の転送が一瞬で終わるからで、遅い回線では本文の途中で切れうる（推測）
- 打ち切りは即時ではない: 上限の後も fetch は約 0.6 秒続き（受信器が本文を受け取ったのは上限の後）、hook は `settled in 2274.7ms` だった
- **上限の延長**: `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS=8000` で `next.budget.ms=7997`、遅延 3 秒の受信先へ 200（3488ms）。mod が session.start で `$.env.set('CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS','8000')` しても `budget.ms=7999` になり、-p・対話とも 200（対話の終了まで 3.49 秒）。記録: `runs/e1-p-d3-ext/`・`e1-p-d3-selfext/`・`e1-i-d3-ext/`

## 2. 応答しない受信先（事実）

受信器は本文を読んだ後に応答しない（`recv.py <port> <out> -1`）。

- session.end（-p・対話）: 1.5 秒で打ち切られ、終了は 2.2〜3.4 秒で済む
- command（-p、timeout なし）: **30612ms で `aborted: no complete answer within 30000ms`**。型定義に fetch の 30 秒は書かれていない（`$.process.run` の 30 秒だけ）
- command（対話、timeout なし）: 画面は `Bunning… · esc to interrupt` でターンが止まる。入力欄への打鍵は受け付ける。Esc で `failed: user-cancel` になり、接続は閉じた
- 自前の timeout（`$.clock.after` で reject する Promise と `Promise.race`）: -p・対話とも 3019〜3020ms で `timeout 3000ms`。**ただし本体側の fetch は残り、受信器への接続は ESTABLISHED のまま約 30 秒続いて閉じた**（lsof で確認）。`AbortController` はグローバルにあるが、HttpInit が signal を取らないので fetch には渡せない
- `$.clock.every`（5 秒周期、`void` で投げ捨て）から投げた fetch はターンを止めない。応答しない受信先に対して同時接続は 5〜6 本で頭打ち（30 秒 ÷ 5 秒）。今の「接続不可・タイムアウトでその回を打ち切る」をタイマーで再現するなら、前回の送信中は次を投げない排他が要る
- 記録: `runs/e2-*`、`runs/e2/recv-hang.jsonl`

## 3. 切り離した送信（事実と、Windows の推測）

- `sender.py` は起動直後に 3 秒待ってから spool を POST し 2xx で消す。-p: claude の終了（1791023482.76）の後、1791023488.16 に POST・200・削除。対話: 終了（1791023533.93）の後、1791023537.82 に POST・200・削除。どちらも子は `ppid=1`。nohup は setsid しないので pgid・sid は本体の側のまま（SIGHUP は nohup が無視）
- `$.process.run` の戻り: 44〜61ms（session.end の予算をほぼ使わない）。-p（entrypoint sdk-cli）でも使えた
- `['sh','-c','sleep 4 &']`（出力を閉じない）は 4085ms 待った。型定義の「a background process left writing holds the call until the timeout」のとおり。**リダイレクトは必須**
- 起動の遅さ: pyenv の shim 経由で python3 の起動に約 2 秒かかった（start ログが run の戻りから 2 秒後）。本体の外なので予算には効かない
- 組み込みの `cc-plugin-telemetry@builtin` も session.start で `$.process.run` の `sh`（引数 2 つ）を走らせている（debug。中身は見ていない）
- **Windows（実機なし。推測）**: 二次資料（devctl PR #144）によると、Bun は Windows で detached でない子をジョブオブジェクトに入れ、親の終了で子を殺す。`$.process.run` に detached の指定は無い。ジョブは孫に継承されるので、`cmd /c start "" /b pythonw sender.py` や PowerShell の `Start-Process` は、ジョブからの離脱（breakaway）が許されない限り本体の終了で殺される可能性が高い。候補:
  - (a) `powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='pythonw …'}"`: WMI のサービスが親になるのでジョブの外に出る（推測）。長所: 追加の登録が要らない。短所: PowerShell の起動が数百 ms〜1 秒以上で session.end の予算を食う、EDR・AV が WMI 経由の起動を検知しうる（二次資料に AV が PowerShell の起動を止めた例あり: claude-mem #3831）
  - (b) `schtasks /create /sc once …` か `/run`: タスクスケジューラが親。長所: 確実にジョブの外。短所: タスクの登録が残る・権限やポリシーで禁止されうる・重い
  - (c) 切り離しをやめ、送信を本体の生存中（session.start・`$.clock.every`・延長した session.end）に寄せる。長所: OS 差が無い。短所: -p の短い実行と強制終了で取りこぼしが増える（次回の起動で送るので失われはしない）
  - (d) `cmd /c start`・`Start-Process`: 実装は簡単だが上の理由で生き残らない可能性が高い。Windows の実機で最初に確かめる対象
- 推測（未確認）: 今の Python 版の `_sender.launch()` も Windows では `start_new_session=True` が効かない（POSIX 専用）。command hook 自体が本体（Bun）から起動されるなら、今の実装も Windows で送信プロセスが本体と一緒に殺されている可能性がある。会社 PC で確かめる価値がある
- 記録: `runs/e3-p-end-detach/sender.log`・`runs/e3-i-end-detach/sender.log`・`runs/e3/recv.jsonl`

## 4. 失敗の区別（事実）

`/g4b err <url>` の結果（すべて `name: "HooksError"`、constructor は `Error`、プロパティは message・name・line・column だけ、cause なし）:

| 場合 | message（`g4b: $.http.fetch(<URL>) ` の後） |
|---|---|
| 接続不可 | `failed: ECONNREFUSED: ECONNREFUSED: Unable to connect. Is the computer able to access the url?` |
| 名前解決の失敗 | `failed: ENOTFOUND: getaddrinfo ENOTFOUND nonexistent.invalid` |
| 自己署名の https | `failed: DEPTH_ZERO_SELF_SIGNED_CERT: self signed certificate` |
| http のポートへ https | `failed: EPROTO: EPROTO: The TLS handshake failed. …` |
| HTTP 500 | 例外にならず `status=500 ok=false` |
| session.end の打ち切り | `failed: The operation timed out.` |
| 本体の 30 秒 | `aborted: no complete answer within 30000ms` |
| Esc | `failed: user-cancel` |

- error 行に積む値は `/failed: ([A-Z_]+):/` で符号だけを抜く（URL は送らない）。TLS 系（`DEPTH_ZERO_SELF_SIGNED_CERT`・`EPROTO`・`UNABLE_TO_VERIFY_LEAF_SIGNATURE` など）と接続系（`ECONNREFUSED`・`ENOTFOUND`）の区別は符号の一覧を自前で持つ必要がある。message の書式は型定義に無いので、版で変わりうる（推測）
- `NODE_EXTRA_CA_CERTS=<自己署名の crt>` を与えると、同じ https 受信器に 200 で届いた。社内 CA は環境変数で渡せる見込み。キーチェーンの信頼を見るかは未検証（キーチェーンを書き換えないため）

## 5. キューの置き場（事実）

- 並行（3 プロセスの -p。開始時刻の差 40ms 以内、所要 1.3〜10 秒で重なっている）:
  - `$.store` のキー `q:<sessionId>` に「読んで 1 件足して書く」× 300: 300・300・300（合計 900）
  - 対照: 共有キー `q:shared` に同じこと: 316/900（**消える**。検査が壊れを検出できることの確認）
  - `$.fs.write` で `queue/<sessionId>.jsonl` を毎回全体書き直し × 300: 300・300・300
- `$.store` の上限: 5 MiB の値 → `$.store.set: the value is 5242882 characters, over the 4194304 limit`。合計が超える 1 MiB の追加 → `the store would be 4770587 characters, over the 4194304 limit`。どちらも reject（例外）で、既存の値（`keep`・3.5 MiB の `big`）は残った。**上限は全セッション・全キーの合計**なので、オフラインが長い端末で全セッションの行が 4 MiB に達すると以後の記録がすべて失敗する
- `$.store` の書き込みは値が大きくなると遅い（300 件の配列への 300 回の set で 8〜10 秒）。キュー本体を store に置くのは不向き（推測を含む判断）
- `$.fs.write`: 4.5 MiB → `refused: 4718592 bytes is over the 4194304-byte limit`（元のファイルは変わらない）。3.9 MiB は書けて読めた。`$.fs.read` は 5 MiB のファイルを `the file is over the 4194304-byte limit` で拒否
- `$.fs.write` は inode を変えずにその場で書き換える（テンポラリ＋rename ではない）。シンボリックリンクを壊さず、リンク先を書き換える。書いている途中で落ちると壊れうる（推測。クラッシュは再現していない）
- `$.fs.list`: 名前順で返った（型定義に順序の保証は無いので自前でソートする）。`size`・`mtimeMs`（ミリ秒、小数あり）が通常ファイルに付く。シンボリックリンクは `kind=other, isLink=true, size=0, mtimeMs=0`、`$.fs.stat` は先の mtime を返す。14 日・20 MiB の判定は list だけで足りる
- 削除: `$.process.run(['rm','-f','--',path])` で消えた（exit 0）。`$.fs.write(path,'')` はサイズ 0 で残るだけ。`$.store.delete(key)` でキーが消え、ファイルは 3.7 MB → 58 KB に縮んだ
- 置き場の結論（推測を含む）: キューは `$.fs.write` のセッション別ファイルにし、1 ファイルを 4 MiB より十分小さく（例 1 MiB）で切り替える。追記がないので 1 行ごとに全体を書き直すことになり、ファイルが大きいほど重い。行の欠落は無いが、書き直しの途中のクラッシュで直前のファイルが壊れうる

## 6. 認証ヘッダと本文（事実）

- 受信器が受けたヘッダ: `content-type: application/x-ndjson`、`x-ingest-token: tok-g4b-123`、`user-agent: Bun/1.4.3`、`connection: keep-alive`
- 本文: 日本語・絵文字・`é ü` を含む NDJSON を JS 文字列で渡し、受信器のバイト列の sha256 が Python で UTF-8 に符号化した期待値と 15 件すべて一致
- 今の `queue.jsonl` は `ensure_ascii=True` で ASCII だけなので、`$.fs.read` した文字列をそのまま送ればバイト列は同じ（推測。ASCII だけの本文は上の結果に含まれる）

## 7. 定期送信とホットリロード（事実）

- 対話で `G4B_EVERY_MS=3000`。約 10 秒後と 22 秒後に scratch のコピーの register.ts を書き換えた。受信器: 0・3・6 秒は世代 `52j0gh`、11・14・17 秒は `102bhq`、23.6・26.6・29.6 秒は `s0osg7`。**世代の重なりなし**。画面に `g4b: reloaded (3 hooks: …)`
- リロードで周期は数え直しになる。-p では session が短く every は実質使えない（RESULTS の前段と同じ）
- 記録: `runs/e7/recv.jsonl`・`runs/e7-i-reload/`

## 8. 既存の状態の引き継ぎ（事実）

- 隔離 cfg に `plugins/data/governance-cc-marketplace-governance-bmsd/queue.jsonl`（2 行）と `spool/` を置き、`$.env.get('CLAUDE_CONFIG_DIR')` から組み立てたパスで 2 行を読め、spool も list できた
- mod からは `CLAUDE_PLUGIN_DATA` が見えない（undefined）。`$.plugin` は name と root だけ。marketplace 名は定数で持つ必要がある。`CLAUDE_CONFIG_DIR` が無いときの既定（`~/.claude`）と Windows の区切り・`USERPROFILE` は自前で扱う
- 4 MiB を超えた古い queue.jsonl・spool は `$.fs.read` で読めない。切り離した Python 送信器に任せるか、捨てるかを決める必要がある

## 補完手段の候補

| 課題 | 候補 | 長所 | 短所 |
|---|---|---|---|
| 終了時の 1.5 秒 | A. session.start で `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` を `$.env.set` | mod だけで済む。-p・対話とも効いた | 公式の扱い（mod から設定してよいか・上限値）を未確認。他プラグインの SessionEnd hook と利用者の終了待ちも延びる。受信先が落ちていると毎回の終了がその分遅れる |
| 同上 | B. managed settings の env で配る | mod から触らない | 配布経路が要る。効果は A と同じ |
| 同上 | C. 切り離した送信プロセス（macOS は nohup） | 今と同じ設計。終了を遅らせない | Python と OS 依存が残る。Windows で生き残る方法が未確定 |
| 同上 | D. 終了時は送らず、session.start と `$.clock.every` で送る | OS 差なし・外部プロセスなし | -p だけの利用者は「次の起動時」まで遅れる。起動時の送信も予算 10 秒（`$` の待ちは時計が止まる）の中で行う |
| 応答しない受信先 | `$.clock.after`＋`Promise.race` と、送信中の排他（`$.state` か fs の印） | ターンを止めない | 裏の接続は最長 30 秒残る。中断はできない |
| append が無い | セッション別ファイル＋サイズでの切り替え | 並行で欠落なし（実測） | 1 行ごとに全体の書き直し。途中のクラッシュに弱い |
| delete・rename が無い | `$.process.run(['rm',…])`／Windows は `cmd /c del` | 確実に消える | OS ごとに分岐。退避（rename）はファイル名を変えずに「送信済みの一覧」を store に持つなどで代替（推測） |
| 4 MiB の上限 | 書く側で 1 ファイルを小さく保つ／古いファイルは Python 送信器に任せる | mod が書くものは上限内に収まる | 旧版の大きなファイルの扱いが別に要る |

## 未検証事項

- Windows のすべて（切り離し・`rm` の代替・パス）。とくに Bun のジョブオブジェクトの下で孫プロセスが生き残るか
- Bedrock・社内プロキシ・社内 CA の下での `$.http.fetch`（`NODE_EXTRA_CA_CERTS` は localhost で効いた。HTTPS_PROXY は未確認）
- 対話で外部 URL へ fetch したときの許可確認（localhost だけ試した）
- `$.fs.write` の途中でのクラッシュによる壊れ方
- `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` の上限値・公式の位置づけ、SIGTERM・SIGHUP での終了時の振る舞い
- 遅い回線で本文の途中で打ち切られたときの受信側（localhost では常に全部届いた）
- `/clear`（reason `clear`）での送信、`$.clock.every` の長時間運用

## 痕跡

- 子 claude・受信器・sender.py・tmux サーバは pgrep・lsof で残存なし。ポート 18830〜18839 に LISTEN・接続なし。tmux ソケット `/private/tmp/tmux-501/gov4b` は削除済み
- 本人の `~/.claude/settings.json` は mtime・サイズとも検証前と同じ。`~/.claude/plugins/store`・`plugins/data` に g4b なし
- `~/.claude.json` は検証中に mtime とサイズが変わった（175536 → 174694）が、g4b・scratchpad/g4b の文字列は含まない。並行して動いている本人のセッションによる更新と見られる（推測。原因の切り分けはしていない）
- 隔離 cfg・runs・ストア（`cfg/plugins/store/g4b_inline-*.json`）は scratch に残してある
