# 実機検証（負荷テスト）の報告書

対象はブランチ `e2e-load-testing`（PR #63 の上）。目的と対象の選定は `strategy.md`、UC ごとの一次情報は `uc-*/notes.md`、生の記録は git 管理外の `.local/e2e-load-testing/uc-*/` にある。
本文の「事実」は実物で観測したこと、「推定」は観測やコードからの推論で、実物では確かめていないことを指す。

## 1. 要約

1. 22 UC を 3 トラック（A 端末の状態・B 送信とサーバ・C 収集と上流の事実）で並行に実施した。環境は macOS（8 コア・8 GiB）・Colima 2 CPU/3 GiB・`claude` 2.1.283。性能の数字は相対比較にだけ使える
2. 発見 1: 本体が settings.json を読み捨てる（型違いの値 1 つ・壊れた JSON・2 MiB 超）と、プラグインの hook が無言で全停止する。配った値が原因なら、直した版も届かない（UC 01・13）
3. 発見 2: 行が無言で失われる経路が端末とサーバの両方にある。`ts` を改名した版の全損、標準ライブラリと同名のモジュール、spool 上限での破棄、uninstall、CSV の日単位の置き換え（UC 55・31・47・60・68）
4. 発見 3: 既存 E2E のゲートに穴がある。撤回を判定しない、送信先が空でも全件緑になる、SessionStart の打ち切り（`cancelled`）を見ない（UC 06・50・14・77）
5. 発見 4: 同時起動や高負荷の端末では、SessionStart hook が 5 秒のタイムアウトで打ち切られる。遅延の主因は hook の処理ではなく pyenv のシムである（UC 14・43・77）
6. 発見 5: 401・404 が続くと error 行が送信回数の二乗で増える。一方 `errors` 表には索引が無く、error 行が大量に入ると概況の画面が遅くなる（UC 46・76）
7. 壊れなかったもの: 送信の全経路で本文の漏れは 0 件（UC 38）。停止からの回復での取りこぼしも 0 件（UC 46）。同時起動でも settings.json は一度も壊れなかった（UC 14）。140 同時の受信でも 5xx は 0 件（UC 77）
8. 全体の判断: 正常系は実物でも保たれた。ただし「無言で止まる・失う」経路の多くは、今の E2E からも管理画面からも見えない
9. リリース前に入れるべきものは 4 章の P1 の 7 件である。どれも数十行以内で済む見込み（推定）。P2 以降は運用を始めてから順に入れてよい
10. 費用は API で約 2〜3 USD（見込みは 10〜40 USD）。所要は約 2.5 時間。未ログインの `-p` でも SessionStart が発火するので、大半をそれで代えられた

## 2. 結果の一覧

重大度の目安は次のとおり。高＝無言で止まる・失う、かつ気づく手段が乏しい。中＝条件付きで失う・誤る、または E2E の判定の穴。低＝影響が限られる、または仕様の説明で足りる。

| UC | 内容 | 結果 | 重大度 |
| --- | --- | --- | --- |
| 01 | 配布値の更新の経路 | 更新は正常に動く（prev_value・ONCE の差し替え・新しい installPath）。ただし型違いの値を配ると、プラグインが無効扱いになり hook が全停止する。直した版も届かない | 高 |
| 06 | 撤回（REMOVE・None・版を下げる） | 撤回は仕様どおりに動く。ただし既存 E2E は撤回を判定しない（壊した実装で合格し、正しい実装で誤って落ちる）。ADD と REMOVE が重なると毎回書き込む。ロールバックで ONCE の利用者値が上書きされる | 中 |
| 12 | policy.py の例外 | 止まるのは適用だけで、お知らせ・収集・error 行は続く。JSON に書けない値で `.settings-*.tmp` が残る。`SystemExit` は全段を無言で止める | 低 |
| 13 | 壊れた settings.json | 本体が捨てるファイルでは hook が動かない。サーバからは「使っていない端末」と区別できない。権限が 0600 に変わる、書けないのにバックアップを取る | 高 |
| 14 | 同時起動の書き込みの競合 | settings.json は一度も壊れなかった。ただし一斉起動 20 本以上で SessionStart がほぼ全部打ち切られた。検査から置換までの間に入った他者の書き込みは消える | 中 |
| 24 | 非対話の起動とお知らせ | `-p` と SDK 相当では既読にならない。ただし親から `claude-vscode` などの値を継いだ `-p` は、人が見ないまま既読にする | 低 |
| 31 | hook の追加・上流のキーの変化 | `-k collect` は 3 種とも落とす。ただし `json.py` と同名のモジュールでは hook が exit 0・行 0 で無言になり、`validate_plugin.py` は合格にする。概況の NULL 率は 4 列だけを見る | 高 |
| 32 | 収集項目（列）の追加 | 手順どおりなら値は届く。ただし同期忘れ・型を誤った ALTER・版のずれは無言でずれる。`server.md` の記述に誤りがある | 中 |
| 35 | スキル名・コマンド名の記録 | 同梱物は `governance:名前` の形と `plugin`、利用者のものは素の名前と `userSettings` で区別できる。`/compact` は command_name に残らない | 低 |
| 36 | サブエージェントと context_tokens | context_tokens が入るのは PreCompact・Stop だけ（9/9）。agent_id で親子を区別できる。Agent を使ったターンで Stop が 2 回記録された | 低 |
| 38 | 本文を送らないことの監査 | 12 シナリオ・全経路で漏れは 0 件。陽性対照 4 種は検出した。送るのは管理対象キーの prev_value だけ | なし |
| 39 | 長い値・特殊文字 | SQLite では巻き込みは無かった。MySQL が utf8mb4 以外だと絵文字 1 字でリクエスト全体が 500 になる。深い入れ子でも 500 になる | 中 |
| 41 | 収集の停止と再開 | 無効化中は行を積まないので、再開後に漏れない。`"0"` も無効化になる（文書どおり） | なし |
| 43 | hook の処理時間と起動の遅延 | hook の処理は 30〜60 ms。遅延の主因は pyenv のシム（1 回約 0.39 s）。高負荷では 5 秒を超えた | 中 |
| 46 | 停止からの回復と再送 | 取りこぼしと重複は 0。ただし 401・404 の間は error 行が k(k+1)/2 で増える。`docker stop` は毎回 SIGKILL で終わる | 中 |
| 47 | spool の上限と長期オフライン | 上限での破棄はどこにも記録されない。前段が 413 で切ると最大 7 日詰まる。config.json が無いと queue が際限なく増える | 中 |
| 50 | 本番の送信先を埋めて E2E | 12 件落ち、7 件通った。送信先が空のまま配っても全件緑になる。DNS の失敗は error 行に出ない | 高 |
| 55 | 版の混在・版の上げ忘れ | `ts` を改名した版の event 行が全損する（サーバは 200 を返す）。版を上げない再 publish は `plugin update` で届かない | 高 |
| 60 | 撤去と再導入 | uninstall は未送信の queue・spool を黙って消す。`statusLine` と配った値は残る | 中 |
| 68 | CSV の取り込み | 件数と合計は正しい。ただし同じ日を含む別のファイルがその日を丸ごと置き換える。値の書式が変わると成功表示のまま NULL になる | 高 |
| 76 | 画面の性能 | 1 年分・200 名（313 万行）で 0.1〜1.8 s。error 行が 70 万行あると概況が 6.9 s。`errors` には索引が無い | 中 |
| 77 | 一斉起動の受信負荷 | 140 同時でも 5xx・取りこぼしは 0。実セッションを 20 並列にすると SessionStart の行が無言で失われた。ロックが 5 秒を超えると 500 になる | 中 |

## 3. 重要な発見の詳細

### 3.1 本体による settings.json の読み捨てと hook の全停止（UC 01・13、高）

- 症状（事実）: settings.json に本体の検証を通らない箇所が 1 つでもあると、本体はファイル全体を黙って無視する。`enabledPlugins` も読まれないため、`plugin list` は `enabled: false` と表示し、hook は 1 本も起動しない
  - このとき policy 行・event 行・error 行はどれも 0 件になる
  - `-p` の stderr・stream-json・終了コードにも、`--debug-file` にも何も出ない
  - 本体はファイルを書き換えない
  - 気づく手段は `claude doctor` の `Invalid settings` だけである
- 再現の条件（事実）
  - 型違いの値: `cleanupPeriodDays: "30"`・`env: "broken"`
  - JSON として壊れたもの: 途中で切れた・末尾カンマ・空・トップが配列または null
  - 2 MiB 超: 2,097,142 バイトは読み、2,097,162 バイトは読まない
  - 宙づりのシンボリックリンク
  - 読まれるもの: BOM 付き・Latin-1 は本体が読む。一方プラグインは `parse_failed` で何も適用しない
- 配った値が原因の場合（事実）: R4 で `SET` に `cleanupPeriodDays: "30"` を入れると全停止した。直した V3 に `plugin update` すると 0.2.4 は入るが、`enabled: false` のまま戻らない。直した値を書くはずの hook が起動しないためである
- 影響（推定）: 管理者が型を 1 つ誤って配ると、全端末で収集が止まり、自力では戻れない。サーバからは「policy イベントが途絶えた端末」としか見えず、利用をやめた端末と区別できない。防げるのは配る前の検査だけである
- 根拠: `uc-01-policy-update/notes.md`（「型違いで enabled: false になる原因の切り分け」）、`uc-13-broken-settings/notes.md`

### 3.2 無言の全損: 同名モジュールと契約違いの行（UC 31・55、高）

- 同名モジュール（事実）: `plugin/hooks/` に `json.py` か `uuid.py` を置くと、hook は exit 0・stderr 空・行 0・error 行 0 で無言になる。error 行を書く経路も同じ `json` を使うためである
  - `scripts/validate_plugin.py` は合格にする。`check_stdlib_only` は自モジュールを許し、実行の検査は exit 0 と無出力しか見ないためである
  - `-k collect` は落ちるが、メッセージは hook 集合の不一致だけで、原因は読めない
  - 根拠: `uc-31-hook-and-upstream-keys/notes.md`
- 契約違いの行（事実）: `ts` を `timestamp` に改名した版の event 行は、4 行中 0 行しか入らなかった
  - サーバは破棄を `dropped` に数えて 200 を返し、端末は 2xx なので spool を消す。欠測はどこにも残らない
  - policy 行は入るので、版の分布ではその端末が普通に現れる
  - 欠けた列は NULL になり、余分な列は捨てられる（どちらも無言）
  - 根拠: `uc-55-mixed-versions/notes.md`
- 版の上げ忘れ（事実）: `plugin.json` の version を上げずに publish し直すと、`marketplace update` で clone は新しくなる。しかし `plugin update` は「already at the latest version」と答え、installPath は旧い中身のままになる。警告は出ず、サーバの `plugin_version` でも区別できない（UC 55）
- 影響（推定）: どちらもリリースを止めるべき種類の失敗である。今の検査で止まるのは、E2E の `-k collect` を流したときだけである

### 3.3 送信先の誤り・破棄・撤去が見えないこと（UC 50・47・60、高〜中）

- 送信先の誤り（事実、UC 50）: 解決できないホスト名では、`getaddrinfo` の失敗が error 行にならない。spool は増え続け、上限で捨てられる
  - E2E は送信先が空でも全件緑になる。`test_send`・`test_leak` は送信先を上書きし、それ以外は配る `config.json` を通らないためである
  - 本番らしい送信先を入れると、12 件が `_market._check_ingest_url` の同じ例外で落ちる。「一部が壊れた」と読み違えやすい
- spool の破棄（事実、UC 47）: 上限は 5 MB と 7 日の 2 つだけ。mtime の古い順にファイル単位で消し、error 行にもログにも残らない
  - 接続できないと、上限を超える 1 ファイルは一度も送られずに消える
  - 前段が本文を読まずに 413 で切ると、`OSError` 扱いで無言のまま毎回打ち切る。後ろのファイルも最大 7 日詰まる。これはスタブでの結果で、AIP の前段に本文の上限があるかは未確認
  - `config.json` が無い版では rotate も prune も走らず、queue が増え続けた
- 撤去（事実、UC 60）: `plugin uninstall` は data ディレクトリを消すので、未送信の queue・spool・既読が黙って失われる（`--keep-data` を付ければ残る）
  - `statusLine`・配った値・`governance/` は残り、ステータスラインは動き続ける
  - `governance/` を消してから入れ直すと、ONCE が利用者の値を上書きする
- 影響（推定）: 端末の送信の失敗・損失を管理者が知る手段が無い。サーバに「端末から最後に届いた時刻」が無いと、配布後の無言の停止に気づけない

### 3.4 CSV の取り込みでの無言の喪失（UC 68、高）

- 症状（事実）: 冪等キーが `day` で、ファイル名の昇順に「その日を消して入れ直す」。このため同じ日を含む別のファイルがあると、後のファイルがその日を丸ごと置き換える
  - 7 月分に 1 行だけの訂正版を足すと、3,144 行が 3,001 行になり、利用者は 140 人から 138 人に減った。画面は両方のファイルに「成功」と出す
- 書式の変化（事実）
  - 同名の `Cost` 列・`$` 付きの値・`123.0` 形のトークンは、成功表示のまま合計 0 か NULL になる
  - 日付の書式が変わって全行が破棄されても、成功と同じ緑の枠で出る
  - 空の `User Email` は `""` として 1 人に数えられる
  - 拡張子が `.CSV` のファイルは無視され、画面に何も出ない
- 実 CSV の事実: `Date` の書式が月で変わる（7 月は `YYYY-MM-DD`、8 月は `YYYY/M/D`）。実装は両方を読めるが、E2E の見本は前者しか通らない
- 突合（事実）: 突合率のタイルは正しく下がる。しかし合わない利用者は画面にもログにも出ない。`/ingest` の `user_email` は小文字にそろえない
- 根拠: `uc-68-csv-import/notes.md`

### 3.5 既存 E2E の判定の穴（UC 06・50・46・31、中）

- 撤回（事実、UC 06）: `test_SETが入り本体の書き込みも残る` は `_dig` が「キーが無い」を None とみなす。このため None・REMOVE を壊した実装でも合格する
  - `test_2回目は適用済みで本体に取り込まれる` は ADD・REMOVE・None のどれを足しても落ちる（`test_settings.py:84-85`）。正しい実装でも落ちる偽の赤である
  - 今の本物の `policy.py` が SET だけなので表に出ていない
  - 壊れた実装でも policy 行は `applied` を名乗る。判定は settings.json の中身で行う必要がある
- 送信先（UC 50）: 3.3 のとおり、配る送信先の値は一度も通らない
- 送信の失敗（UC 46）: `test_send` は error 行を `{(stage, error_type)}` の集合で比べ、失敗も 1 回しか起こさない。二次的な増加も、error 行の消失も見分けない
- 収集（UC 31）: キーパスの判定は「全行を通して 1 つ以上」なので、一部の hook でだけキーが消える改名は検出しない

### 3.6 同時起動・高負荷での SessionStart の打ち切り（UC 14・43・77、中）

- 事実（UC 14）: 同じ config で `claude -p` を一斉に 20 本以上起動すると、SessionStart hook がほぼ全部 `outcome: cancelled`（`exit_code 1`）になり、その回の適用が抜けた
  - 15 本は load 44 でも全部 success、0.5 秒ずつずらせば 30 本でも打ち切りは 0 だった
  - `cancelled` でも処理が最後まで走り、書き込みと policy 行が届いた回がある。`cancelled` の数から適用漏れの数は数えられない
- 事実（UC 77）: 実セッションの 20 並列では、SessionStart の行が 1 つも届かず、error 行も無かった。打ち切りが `_collect_step` より前で起きるためである
  - `session_start.py` を単体で同時に 40 本動かすと、40 本中 39〜40 本が 5 秒を超えた
- 事実（UC 43）: hook の処理そのものは 30〜60 ms、SessionStart の全段で約 80 ms だった。所要の 9 割は pyenv のシム（1 回約 0.39 s）である
  - 起動にかかる時間は、導入なし 0.80 s、導入あり 1.96 s、シムを飛ばすと 1.01 s
  - load 36〜47 ではシム経由の hook が最大 5.95 s かかった
  - 送信先が閉じている・遅い場合も、起動は延びない
- 事実（UC 06・12・50）: 並行の負荷（load 13〜18）の中で、1 回目のセッションの判定が偽の赤になった（12 回中 1 回など）
- 推定: 同じ Mac で多数を起動した人工の条件である。ただし遅い端末や高負荷の端末では、現実にも SessionStart の行と適用が無言で欠けうる
- その他の事実（UC 14）: 同時起動でも settings.json は壊れず、利用者の値も残った。一方 `_settings.py:72-80` の検査から置換までの間に入った他者の書き込みは黙って消える（`probe_window.py` で決定的に再現）。hook 同士なら内容が同じなので無害である

### 3.7 error 行の増え方と画面の遅さ（UC 46・76、中）

- 事実（UC 46）: 401・404 は「届いた」扱いで次のファイルへ進む。このため送信 1 回ごとに spool の全ファイルを POST し、ファイルの数だけ error 行を積む。その error 行も次の spool に入る
  - k 回の失敗で error 行は k(k+1)/2 行になり、k=40 で 820 行（イベント 320 行の 2.6 倍）だった
  - 利用者には何も出ない
  - 概況の「hook の失敗」の件数は、応答の回数を表す
- 推定（UC 46）: 約 180 回の送信（10 分間隔で約 30 時間）で spool が 5 MiB に達し、本物のイベントが押し出され始める
- 事実（UC 76）: 1 年分・200 名（313 万行・1.49 GB）で、4 画面は 0.1〜1.8 s だった。直近 7 日に error 行 70 万行を足すと、概況が 6.9 s（うち `error_summary` が 5.7 s）になった
  - `errors` は索引が 1 本も無く、`db._TABLES`（ANALYZE の対象）からも外れている
  - `/effect` は 5 列の索引が無いと 120 s を超える
- 影響（推定）: 壊れた版やトークンの誤りを配ったときこそ概況を見るのに、そのとき概況が最も遅くなる
- 根拠: `uc-46-recovery/notes.md`、`uc-76-screen-perf/notes.md`

### 3.8 サーバの無言のドリフト（UC 32・39・77、中）

- 列の追加（事実、UC 32）: 明示的に止まるのは、ALTER 忘れと、列名・表の誤りだけである（起動時の `RuntimeError`。出るのはコンテナのログだけ）
  - 同期忘れは `entry.sh` の照合を通り、サーバは起動する。複製とハッシュ記録が互いに一致したままだからである
  - 型を誤った ALTER（`VARCHAR`）も起動し、`max()`・比較が無言で誤る
  - 端末だけが新しい期間の値は、旧サーバが捨てて戻らない
- MySQL（事実、UC 39）: DB が utf8mb3・latin1 だと、4 バイト文字 1 字（latin1 ではかな）で `executemany` が `DataError 1366` になり、同じリクエストの正常な行も 0/2 になる
  - 端末は 5xx でファイルを消さないので、そのファイルは最大 7 日届かない（コードからの推定）
  - 10 万段の入れ子は `RecursionError` で 500 になる（SQLite でも同じ）
  - `event_id` が NULL の行と、`ts=1` の行が検査を通る
- ロック（事実、UC 77）: `sqlite3.connect` の busy timeout は既定の 5 秒で、ロックが 5 秒を超えると `/ingest` が 500 になる。読み取りトランザクションが長いと、画面の `/` も 500 になった
- 根拠: `uc-32-add-column/notes.md`、`uc-39-long-values/notes.md`、`uc-77-burst-ingest/notes.md`

### 3.9 `_settings.py` の書き込みまわりの不具合候補（UC 06・12・13・14、中〜低）

いずれも事実として再現した。

| 箇所 | 症状 | 根拠 |
| --- | --- | --- |
| `_settings.py:68-82` `_write` | JSON に書けない値で `TypeError` が `except OSError` を素通りし、0 バイトの `.settings-*.tmp` が残る（例外の版が配られている間、セッションごとに 1 つ） | UC 12 |
| `_settings.py:76-80` | バックアップを置換の前に取るため、置換が失敗（uchg）するたびに増える。10 世代で本物のバックアップが押し出される | UC 13 |
| `_settings.py:60`・`:80` | `mkstemp` の 0600 で置き換えるので、0644・0444（読み取り専用）が失われる | UC 13 |
| `_settings.py:59` | 宙づりのリンクの先に `mkdir(parents=True)` でファイルを作る | UC 13 |
| `_policy_ops.py:146-152` と `apply_settings` | ADD と REMOVE に同じ要素があると、毎セッション `applied` 2 行を送り、バックアップを取る | UC 06 |
| `_settings.py:110-116` | ONCE の記録は今の policy の組だけを持つ。前の値へ戻すと、利用者の値を上書きする | UC 06 |

## 4. 課題と改善案

優先度: P1＝リリース前に入れる（無言で止まる・失う、または E2E の信頼を崩す）。P2＝運用を始めてから早めに入れる。P3＝あれば良い。

### 4.1 プラグイン・サーバの不具合と修正案

| 優先 | 対象 | 変更 | UC |
| --- | --- | --- | --- |
| P1 | `tests/plugin/test_policy_schema.py` | SET・ONCE の値を既知キーの型表（上流の JSON Schema が取れればそれ）で検査する。あわせて JSON に直列化できること（set・tuple の混入なし）を検査する。壊した `policy.py` で落ちることを確かめる | 01・12 |
| P1 | `scripts/validate_plugin.py` | `check_stdlib_only` で、`plugin/hooks/*.py` の stem が `sys.stdlib_module_names` に含まれたら不合格にする。hook の実行検査で最小の入力を与え、queue が 1 行以上増えることを見る | 31 |
| P1 | `server/ccgov/ingestion/csv_import.py` | `import_all` でファイルごとの日の集合が重なったら、画面にファイル名と日数を出す（止めるか警告に留めるかは判断）。`rows == 0 and dropped > 0` を `err` の枠で出す。`_resolve_header_index` で必須列の重複を拒否する。`server/tests/test_ingestion_csv_scan.py` にテストを足す | 68 |
| P1（MySQL を使う場合） | `server/ccgov/store/db.py` | MySQL の `CREATE TABLE` に `DEFAULT CHARSET=utf8mb4` を付ける。起動時に `information_schema.COLUMNS` で VARCHAR の文字コードを検査し、utf8mb4 以外なら起動を止める | 39 |
| P2 | `plugin/hooks/_sender.py` `_post_file`・`run` | 401・403・404・5xx ではその回を打ち切る（400・413 だけは次へ進む）。error 行は送信 1 回につき 1 行になる。`docs/spec/plugin.md` の「HTTP のエラー応答なら次のファイルへ進む」を変え、`docs/decisions/plugin.md` に理由を残す | 46 |
| P2 | `plugin/hooks/session_start.py` | SessionStart の行の追記を identity の直後へ移し、送信判定だけを最後に残す。`hooks.json` の SessionStart の `timeout` を 5 から 15 秒にするかを検討する | 14・43・77 |
| P2 | `plugin/hooks/_spool.py`・`_sender.py` | `prune` が消したことを error 行（stage `prune`、type `age` か `size`）に残す。`_load_config` が None でも、既定値で `rotate`・`prune` を行う（POST だけしない） | 47・50 |
| P2 | `server/ccgov/ingestion/ndjson.py` | 必須列の欠落などで捨てた行を、理由ごとの件数でログか `errors` に残す。`RecursionError` を捕まえて破棄に数える。`event_id` の検査を coerce の後に移し、`ts` の真偽値を拒否する | 39・55 |
| P2 | `server/ccgov/store/db.py` | `connect()` を `sqlite3.connect(path, timeout=30)` にする。`errors` を `_TABLES` に入れ、`(day, stage, error_type)` の索引を足す。`error_summary` は GROUP BY を先にして、窓関数による全行の並べ替えをやめる（効果は未実測） | 76・77 |
| P2 | `server/entry.sh:75` | `exec waitress-serve ...` にして SIGTERM を届ける | 46 |
| P2 | 概況（`server/` の健全性のクエリ） | NULL 率の対象を `HOOK_FIELDS` の全列に広げるか、分布の表に NULL の行を出す。`skill_name` の分母が `tool_name` に依存することを注記する | 31・55 |
| P2 | `plugin/hooks/_settings.py` | 3.9 の表のうち、一時ファイルの後始末（`finally`）、失敗時にバックアップを取らない（直前と同じ内容でも取らない）、元の `st_mode` を保つ、を直す。`tests/plugin/client/test_settings.py` に回帰テストを足す | 12・13 |
| P2 | `tests/plugin/test_policy_schema.py`・`_policy_ops.py` | `test_定義の形` に「同じパスの ADD と REMOVE に同じ要素が無い」を足す | 06 |
| P3 | `server/ccgov/store/db.py` `_check_contract_columns` | 列名に加えて宣言型も照合する（MySQL の型表記の正規化が要る） | 32 |
| P3 | `plugin/hooks/_govdir.py` | `save_once`（`:84`）を mkstemp と `os.replace` による書き込みにし、`sync_statusline`（`:107`）の一時ファイル名を mkstemp にする。`_settings.py:72-80` の検査は置換の直前へ移す | 14 |
| P3 | `plugin/hooks/session_start.py:75`・`_browser.py:18-20` | 既読を書く条件を、対話の値の許可リスト（`cli` など）にするか判断する | 24 |
| P3 | `server/` の取込・受信 | 空の `User Email` を NULL にする。`.CSV` の大文字の拡張子を拾う。末尾の空行を破棄に数えない。`/ingest` の `user_email` を小文字にそろえる | 68 |
| P3 | 送信プロセス | 多重起動の排他（ロックファイル）。送信が 600 秒を超えると同じ spool を並行に送りうる（推定） | 43 |

### 4.2 `e2e/` のスクリプトの追加・修正

| 優先 | 対象 | 変更 | UC |
| --- | --- | --- | --- |
| P1 | `e2e/conftest.py` | セッション開始時に `plugin/config.json` の `ingest_url` を `_market._check_ingest_url` と同じ規則で見て、ローカルでなければ理由を添えて `pytest.exit` する | 50 |
| P1 | `e2e/_flow.py` `session()` | stream-json の SessionStart の `hook_response` の `outcome` が `success` であることを確かめる。`cancelled` なら「打ち切り」と名指しして失敗させる。20 並列で実際に落ちることは確認済み | 06・12・14・77 |
| P2 | `e2e/test_settings.py` | 既存値のある端末からの撤回を 1 本足す（`scenarios.py` の A・B が雛形、30 秒程度）。policy は overrides で差し替え、settings.json の中身で判定する。あわせて `:84-85` の期待を、SET 以外でも成り立つ形にする | 06 |
| P2 | `e2e/test_settings.py` | 本体が捨てる settings.json（例 `env: "broken"`）で、`hook_rows` が空・バイトが不変であることを見る。上流が扱いを変えたら落ちるので、その合図になる | 01・13 |
| P2 | `e2e/test_server.py` | 不正な 1 行（壊れた UTF-8・JSON 配列）が、同じリクエストの正常な行を巻き込まないことを見る。`skill_name` に入れた XSS 文字列が `/assets` に生で出ないことも見る。取込は、再取り込みで件数が変わらないこと、必須列を消すと「失敗」が出ることを見る | 39・68 |
| P2 | `e2e/test_leak.py` | シナリオを足す（Read の中身・Glob で見つけたパス・PostToolUseFailure・`/cmd` の引数・`/compact <指示>`）。`recorder.py` 相当の受け口で送信の生バイトを走査する。断片・base64 で照合し、docker logs も走査する | 38 |
| P2 | `e2e/test_collect.py` | 行が 0 件のときに「全 hook が 0 行＝import の失敗の疑い」と出す | 31 |
| P3 | `e2e/_root.py`・`_server.py` | `E2ERoot` の接頭辞を `CC_E2E_RUN` から作る。`DockerServer` に `sql()` を足し、`request` にタイムアウトの引数を足す。`stop()`・`restart()` を足すなら、再開でポートが変わることを返す。`hook_rows` の docstring に「送信済みの行は端末から消える」と書く | 01・12・13・46・68 |
| P3 | `e2e/samples/cost_daily.csv` | 8 月の書式（`YYYY/M/D`・`E-`）の行を 1〜2 行足す | 68 |
| P3 | `e2e/test_notices.py` | PATH の先頭に偽の `open` を置き、URL 付きのお知らせで `-p` を起動しても呼ばれないことを見る。これには `_root._EXTRA_KEYS` で PATH を渡せる必要がある | 24 |

昇格させないもの: 同時起動（UC 14）、画面の性能（UC 76）、受信の負荷（UC 77）、時間の判定（UC 43）。揺れが大きく、無言で壊れる種類でもない。
組み合わせの網羅（設定のマージ・CSV の書式・spool の境界）は `tests/`・`server/tests` に置くほうが安く確実である。

### 4.3 `docs/guide/e2e.md` の修正

| 優先 | 箇所 | 追記・修正 | UC |
| --- | --- | --- | --- |
| P1 | 前提 | 送信先が空の開発ツリーで流すこと。本番の値を入れると 12 件が publish で落ちること。E2E は配る送信先を一度も通らないこと | 50 |
| P2 | 前提（並行） | `CC_E2E_RUN` は同時に動く実行ごとに一意にすること（トラック単位では足りない）。同じ Mac で `claude` を 10 本を超えて同時に起動しないこと。重いマシンでは SessionStart が 5 秒で打ち切られ、偽の赤になること | 39・14・77 |
| P2 | 設定の配布の限界 | 空の settings.json から始まり、撤回（REMOVE・None）は判定しないこと。本体が捨てる settings.json ではプラグインが起動しないので、`parse_failed` は普通は観測されないこと | 06・13 |
| P2 | サーバの前提と罠・限界 | ハッシュの照合は同期忘れを通すこと。E2E は SQLite で動くので、文字コードや strict モードは見ないこと。取込の「N 行」を合格と見ず、DB を確かめること（冪等キーは `day`）。実セッションの直後の DB には一部しか届いていないこと（送信の間隔が 10 分） | 32・39・68 |
| P2 | 非漏洩 | 送らないもの・送るもの（管理対象キーの prev_value）・端末に残るもの（settings のバックアップ・`.pyc`）を分けて書く | 38 |
| P3 | 送信・収集の限界 | 失敗は 1 回しか起こさない（二乗の増加・spool 上限との相互作用・重複は見ない）。一部の hook だけでのキーの消滅は検出しない。`PermissionDenied` は `-p` では発火しない（2.1.283） | 46・47・31 |
| P3 | 手動確認 | ステータスラインは `statusLine.command` を隔離した env のシェルで実行して確かめる。ブラウザは偽の `open` で確かめる（先に URL 無しで `which open` を確かめる）。所要時間は E2E の範囲外で、シムの有無と load average を添えて測る | 60・24・43 |

### 4.4 e2e スキルの拡充・修正

| 優先 | 変更 | UC |
| --- | --- | --- |
| P2 | 一時スクリプトを `.local/<作業名>/` に書く手順を明示する。共通の型は次の 3 つ: (1) 判定の自己検査（`selftest`）を先に走らせる、(2) 壊した実装で判定が落ちることを確かめる、(3) `CC_E2E_RUN=<トラック>-<作業名>` を付ける | 全般 |
| P2 | 「5. staging を確かめる」の手前で、`config.json` の送信先を確かめる（開発ツリーでは空、配布側では https の本番値） | 50 |
| P3 | `references/` にユースケース別のワークフローを分ける。(a) 更新・撤回（既存値を入れる→2 段階の更新→中身で判定。UC 01・06・60）、(b) 送信・回復（hook の直接起動・`sent_at` の mtime を 601 秒戻す・`CLAUDE_PLUGIN_DATA` をコピーに向ける・応答を捨てる中継。UC 46・47）、(c) 受信・取込の堅牢性（正常な行で挟む・DB と突き合わせる。UC 39・68）、(d) 負荷・計時（直接起動で判定を先に固める・`heavy.lock` を trap で返す・sleep 入りで計測を確かめる・load average を添える。UC 14・43・77） | 14・39・43・46・47・68・77 |
| P3 | 「踏みやすいところ」に足す: `pgrep -f` が自分のシェルに一致する（`[p]ytest` の形にする）、送信先を埋めると端末から行が消える、`-p` は既読にしない、`-p` ではステータスラインが描画されない | 50・12・41・60 |
| P3 | ユースケース集（`.local/e2e-load-testing/e2e-usecases.md`）の誤りを直す。13 の手順（導入どおりの状態では `parse_failed` の行は出ない）、56 の補足（前の値へ戻すと ONCE は書き直される）、35 の `command_source` の値（`user` ではなく `userSettings`） | 13・06・35 |

### 4.5 `docs/knowledge/` に足す外界の事実と `docs/` の誤り

外界の事実（`claude` 2.1.283・macOS で観測。版を添えて書く）:

| 書く先 | 事実 | UC |
| --- | --- | --- |
| `claude-code-behavior.md` | 本体は、JSON として壊れた・トップが配列か null・空・スキーマ違反・2 MiB 超の settings.json をファイルごと黙って無視する。`enabledPlugins` も効かない。`-p` には何も出ず、`claude doctor` の `Invalid settings` だけに出る。BOM 付き・Latin-1 は読む。無視したファイルは書き換えない | 01・13 |
| 同上 | `-p` が `CLAUDE_CODE_ENTRYPOINT` を `sdk-cli` に書き換えるのは `cli` と空のときだけ。`sdk-*`・`claude-vscode`・未知の値はそのまま hook に届く | 24 |
| 同上 | hook の timeout 超過は `outcome: cancelled`・`exit_code 1` になる。それでも処理が最後まで走り、副作用が残ることがある。stream-json に出るのは SessionStart の hook の結果だけ。同じ config で一斉に 20 本以上起動すると、ほぼ全部が打ち切られた | 14・77 |
| 同上 | `plugin update` は版だけで判定し、版の引き下げも受け付ける。uninstall は `enabledPlugins` の項目と data を消し、`--keep-data` で data を残せる。`marketplace remove` は `extraKnownMarketplaces.<mp>` を丸ごと消す | 06・55・60 |
| 同上 | hook の `python3` は利用者の PATH で解決される。pyenv のシムだと 1 回約 0.4 s かかる。未ログインの `-p` では SessionStart と UserPromptSubmit だけが動く | 43 |
| `upstream-features.md` | `PermissionRequest` は `-p` の既定モードで発火する（キーは UC 31 の表）。`PermissionDenied` は既定モードでも、auto mode の deny でも発火しない。`command_source` は `userSettings` か `plugin`。同梱物は `governance:名前` の形。`/compact` は UserPromptExpansion を経ない。context_tokens は PreCompact・Stop だけ。Agent を使うターンで Stop が 2 回出た（解釈は推定） | 31・35・36・38 |
| `db-and-framework-facts.md` | MySQL 8.4 と pymysql 1.2.3 の `executemany` は、utf8mb3・latin1 の表で `DataError 1366` になり、全行が入らない。`json.loads(bytes)` の性質（surrogatepass・BOM・4300 桁・`RecursionError`）。Jinja は制御文字を逃がさない。`sqlite3` の busy timeout は既定 5 秒。waitress の既定は 4 スレッド・`connection_limit` 100。SQLite の型アフィニティ（数字文字列を整数にし、VARCHAR の列では text で比較する）。`python:3.9-slim` の SQLite は 3.46.1。`sh` を PID 1 にすると `docker stop` が SIGKILL で終わる | 32・39・46・76・77 |
| `measurements.md` | 1 年分・200 名での 4 画面の応答（条件つき）。140 同時の受信（p95 2〜3.5 s、5xx 0）。AI Gateway の CSV は月で `Date` の書式が変わり、`Cost` に指数表記（`e-`・`E-`）がある | 68・76・77 |

`docs/` の誤り・欠落:

| 箇所 | 内容 | UC |
| --- | --- | --- |
| `docs/spec/server.md:17` | 「複製の直接編集と同期忘れをここで検出する」は誤り。検出するのは複製の直接編集だけで、同期忘れは `sync_contract.py --check` と `tests/integration/test_contract_sync.py` が捕まえる | 32 |
| `docs/guide/release.md` の 6・11 | 確認項目の同期に `contract.py` の変更が無い。11 に次を足す: 型を契約と同じにすること、ALTER の実行のしかた（イメージに `sqlite3` CLI は無い）と `PRAGMA table_info` での確認、端末を先に配ると値が戻らないこと、列の並びを固定したテスト 2 件を直すこと | 32 |
| `docs/guide/release.md` の 10 | ADD から消さずに REMOVE に書くと、毎回書き込みが起きること。ロールバックしても、ADD の要素と ONCE の上書きは戻らないこと。版の上げ忘れはサーバから検出できないこと | 06・55 |
| `docs/spec/plugin.md` | ONCE の記録は今の組だけを持つこと。本体が読めない settings.json ではプラグインが起動しないこと。撤去で `seen.json` と未送信分が消えること | 06・13・60 |
| `docs/decisions/server.md` | 概況の「数秒級になりうる（推測）」は、実測（直近 7 日が 30 万行で 3.5〜5 s）に置き換えられる | 76 |
| `docs/knowledge/upstream-features.md` | 「PermissionRequest の発火条件は未確認」を、4.5 の事実で更新する | 31 |

## 5. 検証の方法への所見

### 効いたこと

- **`CC_E2E_RUN` によるラベルの分離**: 準備の段で、2 本を並行させて両方合格すること、既定のままでは後から始めた方が止まることを確かめた。ただしトラック単位では足りず、同じトラックの UC 同士でも衝突した。UC 39 以降は `b-uc39` のように UC 単位にした（`uc-39-long-values/notes.md`）
- **worktree と UC 別のフォルダ**: 3 トラックのブランチは衝突なく統合できた（マージのコミット 3 つ）
- **判定を壊して確かめる規律**: 全 UC が、自己検査・変異・陽性対照のいずれかで、判定が落ちることを確かめた。これで期待の誤りも見つかった（UC 01 の R3、UC 12 の run1、UC 39 の 2 ケース、UC 41 の A5）
- **未ログインの `-p` の活用**: SessionStart は未ログインでも発火するので、設定と送信の大半を API 費用なしで回せた。見込み 10〜40 USD に対し、実績は約 2〜3 USD だった（トラックの記録の合算。一部は見積もり）
- **`heavy.lock`**: 巨大ファイル・同時起動・監査・大きな取込・画面の測定・受信の負荷（UC 13・14・38・68・76・77）を直列にできた。全員が `trap` で返し、残存は無い

### 効かなかったこと

- **並行の負荷で数字が揺れた**: `heavy.lock` は重い段どうしの重なりを防ぐだけである。軽い作業の並行で load average は 5〜47 を動いた。その結果、画面の中央値が同じ実行計画のまま 2 倍揺れ（UC 76）、hook の計測に高負荷の区間が混ざり（UC 43）、偽の赤が出た（UC 06・12・50）
- **片付けの判断が「他トラックのものか」で止まった**: `E2ERoot` の接頭辞を変えられず、ラベルの無い `cc-e2e-*` を各トラックが「自分のものではない」として残した。Docker のビルドキャッシュと Colima のディスクも、共有のため誰も消していない
- **自己申告と実物の食い違い**: UC 76 の notes は DB を「すべて削除」と書くが、1.5 GB の `s100.db` が `.local/` に残っている（6 章）。片付けの報告は証拠にならない
- **作業上の罠**: `pgrep -f "pytest e2e"` が自分のシェルに一致し、待機が止まらなかった（UC 50）

### 次回への提案

- 計測の UC（43・76・77）は、ほかのトラックを止めた専用の時間帯に行う。`heavy.lock` の意味を「重い」から「計測中は他が claude と Docker を起動しない」に広げる
- `CC_E2E_RUN` は `<トラック>-<UC>` を規約にし、`E2ERoot` の接頭辞もそこから作る（4.2 の P3）
- 最後の棚卸しは監督が実物で行う: `git worktree list`・`ls $TMPDIR`・`docker system df`・`du .local/`。共有の資源（ビルドキャッシュ・fstrim）は監督が判断する
- 複数のトラックが同じ部品を書き直した。`Box`/harness、送信の生バイトの受け口、`DockerServer.sql()` を `e2e/` に取り込むかを決める

## 6. 片付けの状況

「確認」は、報告書を書いた時点で監督が実物を見たもの。「自己申告」は、track-*.md と notes.md の記述である。

| 対象 | 状態 | 出どころ |
| --- | --- | --- |
| worktree `wt-a`・`wt-b`・`wt-c` | 監督が取り外した（`.venv` と `server/` の複製も消えた）。取り外す前の確認に `git status` を使ったため、worktree の中の git が無視するファイル（worktree 内の `.local/` など）は確かめていない。記録にあるスクリプトの出力先はすべて本体の `.local/` で、失ったものは無いと推定する | 確認・推定 |
| ブランチ `e2e-load-testing-a`・`-b`・`-c` | ローカルと origin の両方に残る。統合済み。消すかは判断待ち | 確認 |
| ハンドオフ文書 | `bmsd-governance/work/e2e-load-testing/`（`common.md`・`handoff-a/b/c.md`）に残る。`product/` の外なので成果物に影響しない | 確認 |
| `heavy.lock` | 残存なし（`tmp/e2e-load-testing/` と `work/` に無い） | 確認・自己申告 |
| `$TMPDIR/cc-e2e-*` | 0 件（トラックが残したラベルなしの 5 つも今は無い） | 確認 |
| Docker のコンテナ | 0 件 | 確認 |
| Docker のイメージ | `server-server:latest`（228 MB、作成は 45 時間前で今回より前）と `python:3.9-slim` が残る。`mysql:8.4` は UC 39 が消した | 確認・自己申告 |
| Docker のビルドキャッシュ | 1.216 GB（解放できる分は 0.99 GB）が残る。共有のため誰も消していない | 確認 |
| Colima のデータディスク | 監督が `colima ssh -- sudo fstrim -a` を実行し、ホストの空きが 5.3 GiB から 8.5 GiB に戻った。`docker builder prune` は利用者の判断で実行していない（ほかのプロジェクトのキャッシュも消えるため） | 確認 |
| `.local/e2e-load-testing/` | UC 76 の `s100.db`（1.5 GB、notes の「削除した」と食い違っていた）は、利用者の承認を得て監督が消した。残りは約 21 MB（UC 76 の測定用 venv と各 UC の生の記録） | 確認 |
| `.local/` の機微なもの | UC 68 の実 CSV の複製（`stage/`）は削除した。`report.json` は中立なファイル名だけを持つ。UC 39 の MySQL のログはパスワードを伏せた。UC 35・36 の `queue-raw.jsonl` は識別子を含みうる。UC 24・60 の JSON は一時パスとポートを含む。`e2e-usecases.md` がある。API キーの混入は無いと各トラックが申告している（全ファイルの走査は未確認） | 自己申告 |
| `e2e/__pycache__/` | 残る（gitignore の対象） | 自己申告 |
| 本物の `~/.claude` | 各 UC が痕跡の無いことを確かめた。`~/.claude/cc-governance/identity.json`（9/26 付）は今回より前からあり、触っていない | 自己申告 |
| コード | 今回の変更は準備の `e2e/_server.py`（`CC_E2E_RUN`、コミット 0750fa0）だけ。`plugin/`・`server/`・`e2e/`・`plugin/config.json` は検証の後に元へ戻した。UC 32 の差分は `uc-32-add-column/*.diff` にだけある | 自己申告 |
| 起動したプロセス | 監督がテスト由来のプロセス（`claude -p`・waitress・pytest・送信）が 0 件であることを確かめた | 確認 |
| ホストのディスク | 検証の前は約 19 GiB 空いていた（利用者の記憶）。22:40 時点で 9.8 GiB。差の主因はスワップ（7.4 GB 使用、VM ボリュームが 8.6 GB）で、並行セッションと Colima によるメモリ不足で増えたと推定する。セッションを閉じるか再起動で戻る。ほかに pytest の一時ディレクトリ（`$TMPDIR/pytest-of-*`、750 MB。3 世代で自動的に入れ替わる）と Docker のビルドキャッシュ（1.2 GB）。Cursor の更新の一時ファイル（約 1 GB）は今回と無関係 | 確認・推定 |

## 7. 検証しなかったこと・限界

### 戦略書で対象外にしたもの

- この環境では不可能なもの: Windows、Bedrock、AIP へのデプロイ、社内のプロキシ・証明書、配布リポジトリの staging と自動更新の実配信、IDE 拡張
- 対話でしか見えない表示（ステータスライン・エラー表示・既読）: 手動確認に回す
- 本番のデータが要る調査、集計ロジック・効果測定・MySQL の網羅（`server/tests` の領分）、旧版の Claude Code での回帰
- 性能の数字は、Colima（2 CPU・3 GiB）で並行の負荷がかかった中で測った。本番（AIP・Python 3.9・MySQL の可能性）の性能を表さない

### UC ごとの中断・未確認

| UC | 確かめていないこと |
| --- | --- |
| 01 | int の 60 のままで設定が効くか。古いバックアップを戻して直るか |
| 06 | 10 世代を超えてバックアップが押し出されること（推定）。自動更新の経路での版の引き下げ |
| 13・60・24 | 対話起動での表示。本物の Agent SDK と VS Code 拡張。新しい版への再導入 |
| 14 | 認証ありでの同時起動と、対話での同時起動。打ち切られた hook がどこで止まったか（推定） |
| 31 | 分類器の拒否で `PermissionDenied` が発火するか（再現できず中断） |
| 32 | AIP で起動に失敗した Function の見え方。`collect.py SessionStart` で行が増えない理由 |
| 36 | Stop が 2 回出る解釈（推定。観測は 1 回の実行だけ） |
| 39・47 | waitress の既定の本文上限。AIP の前段の本文上限。実際のプロキシでの 413 の振る舞い |
| 43 | セッション中に hook 1 回の増分が単体の約 2 倍になる原因。送信プロセスの多重起動による重複（推測） |
| 46 | spool が 5 MiB に達するまでの約 30 時間（外挿）。`rotate` の間の追記の喪失（推定） |
| 50 | DNS の問い合わせが上流まで出たか |
| 55 | 起動時の自動更新が起きなかった原因（`DISABLE_AUTOUPDATER` か `-p` か）。最初の試行で `sent_at` ができなかった原因 |
| 68 | MySQL での `NaN` の cost。AIP の前段のタイムアウト（50 万行の取込で 93 s） |
| 76 | `errors` に `day` の索引を足した効果（DB を先に消して測れず中断）。「5 倍を 1 年分」（ディスク不足のため、直近 35 日だけ 5 倍で代えた）。MySQL での 5 列の索引 |
| 77 | 大きな DB で ANALYZE が 5 秒を超えるか。20 並列の 1 回目で送信が起きなかった 8 セッションの原因（診断を取っていない） |
| 38 | API 費用の実額（推定のみ） |
