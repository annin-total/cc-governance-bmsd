# 実機検証（負荷テスト）の報告書

対象はブランチ `e2e-load-testing`（PR #63 の上）。目的と対象の選定は `strategy.md`、UC ごとの一次情報は `uc-*/notes.md`、領域ごとの精査は `analysis/d1`〜`d5-verification.md`（以下 D1〜D5。改善案の ID は D3-04 のように引く）、生の記録は git 管理外の `.local/e2e-load-testing/uc-*/` にある。
本文の「事実」は実物で観測したこと、「推定」は観測やコードからの推論で、実物では確かめていないことを指す。精査はすべて静的な確認（コードと文書の読解）である。

## 1. 要約

1. 22 UC を 3 トラック（A 端末の状態・B 送信とサーバ・C 収集と上流の事実）で並行に実施した。環境は macOS（8 コア・8 GiB）・Colima 2 CPU/3 GiB・`claude` 2.1.283。性能の数字は相対比較にだけ使える
2. 最重要の発見: 送信先の扱いが手順どうしで両立しない。`release.md` は開発ツリーの `config.json` に本番の値を置かせるが、E2E はローカル以外の送信先を拒み、`validate_plugin.py` と `pytest tests` は本番の値を読んで本番へ POST しうる（コードからの推定）。利用者は案 A（開発ツリーに本番値・E2E の組み立てで差し替え）を選んだので、この 3 か所を本番の値を入れる前に直す
3. 本体が settings.json を読み捨てると（型違いの値 1 つ・壊れた JSON・2 MiB 超）、hook が無言で全停止し、直した版も届かない。配る前の型検査は既にある（schemastore のスキーマ）が、復旧手順がどこにも無い（UC 01・13）
4. 送信の失敗・破棄・打ち切りは、多くが受け入れ済みの損失である。ただし HTTP エラーの間の error 行の二乗の増加（UC 46）と、SessionStart の打ち切り（UC 14・77）は設定と小さな修正で緩和できる
5. 壊れなかったもの: 本文の漏れは全経路で 0 件（UC 38）。停止からの回復での取りこぼしは 0 件で、重複は画面を水増ししない（UC 46）。同時起動でも settings.json は壊れない（UC 14）。140 同時の受信で 5xx は 0 件（UC 77）。CSV が無くても起動・受信・4 画面の描画は成り立つ（静的な確認）
6. 全体の判断: 正常系は実物でも保たれた。リリースを止めるのは送信先まわりの手順と誤送信（P1-1〜3）、復旧手順の欠落（P1-4）、staging での到達確認の欠落（P1-5）で、P1 は 5 件（どれも数行〜十数行か文書）。ほかは運用を始めてから順に入れてよい
7. 費用は API で約 2〜3 USD（一部は見積もり。見込みは 10〜40 USD）、所要は約 2.5 時間。未ログインの `-p` でも SessionStart が発火するので、大半をそれで代えられた

## 2. 利用者の決定事項

本報告書は次を前提にする。

| 事項 | 決定 |
| --- | --- |
| 送信先の置き場 | **案 A。**開発ツリーの `plugin/config.json` に本番の値を置く（今の `release.md` のまま）。E2E は `e2e/_market.py` の組み立てで送信先をローカルか空に差し替える。`decisions/plugin.md` の「空のまま置く」を改める。`conftest` で E2E を止める案は採らない |
| CSV が無いときの準拠率 | 端末基準で出す。分母を「policy 行が届いた利用者」に切り替え、「未導入者は含まない（CSV があれば含める）」と注記する（P2） |
| hook の `timeout`（`hooks.json`） | SessionStart は 60 秒、収集の hook は 10 秒。`session_start.py` は `source` で分岐しないので resume・clear・compact でも適用は走る。新しい版が効くのは次に起動したプロセスからで、長く続くプロセスに新しい policy が届くのは再起動か resume まで（未検証） |
| spool の上限（`config.json` の `spool_max_days`・`spool_max_bytes`） | 14 日・20 MB。error 行の二乗の増え方の修正とセットにする |
| 量の対策（古い生データの日次集計への圧縮など） | 将来の検討事項。置き場は `decisions/server.md` の「条件が変われば再検討すること」 |
| 文書の設定値 | 数値で直書きせず、名前（`hooks.json` の `timeout`、`config.json` の `spool_max_days` など）で書く。実測値は数値でよい |
| 採らないもの | 端末側での集計・粒度の段階・gzip（今の量は小さい） |
| 全体の方針 | 厳格にしすぎない。受け入れ済みの損失や限界は蒸し返さない。CSV は疎結合で任意の補強であり、CSV が無くても全機能が動作・表示・テストできることを守る |

## 3. 結果の一覧

重大度: 高＝無言で止まる・失う、かつ気づく手段が乏しい。中＝条件付きで失う・誤る、または E2E の判定の穴。低＝影響が限られる、または仕様の説明で足りる。

| UC | 内容 | 結果 | 重大度 |
| --- | --- | --- | --- |
| 01 | 配布値の更新の経路 | 更新は正常（prev_value・ONCE の差し替え・新しい installPath）。型違いの値を配ると本体が settings.json を捨て、hook が全停止し、直した版も届かない。配る前の型検査は既存のテストにある | 高 |
| 06 | 撤回（REMOVE・None・版を下げる） | 撤回は仕様どおり。E2E は撤回を判定せず、SET の None・ADD・REMOVE で偽の赤になる。ADD と REMOVE が重なると毎回書き込む（仕様違反）。前の値へ戻すと ONCE が再び書く（仕様が曖昧） | 中 |
| 12 | policy.py の例外 | 止まるのは適用だけで、お知らせ・収集・error 行は続く。JSON に書けない値で `.settings-*.tmp` が残る（既存のテストがその値を止める）。`SystemExit` では identity と statusline の後、行とお知らせを出す段がすべて止まる | 低 |
| 13 | 壊れた settings.json | 本体が捨てるファイルでは hook が動かず、サーバからは使っていない端末と区別できない。バックアップが置換の失敗のたびに増え、本物の世代を押し出す | 高 |
| 14 | 同時起動の書き込みの競合 | settings.json は一度も壊れない。一斉起動 20 本以上で SessionStart がほぼ全部打ち切られた。検査から置換までの窓の書き込みは消える（hook 同士なら無害） | 中 |
| 24 | 非対話の起動とお知らせ | `-p` と SDK 相当では既読にならない。親から `claude-vscode` などを継いだ `-p` は既読にする（受け入れ済み） | 低 |
| 31 | hook の追加・上流のキーの変化 | `-k collect` は 3 種とも落とす。`json.py` と同名のモジュールでは hook が exit 0・行 0 で無言になり、`validate_plugin.py` は合格にする。概況の NULL 率は 4 列だけ | 中 |
| 32 | 収集項目（列）の追加 | 手順どおりなら届く。同期忘れは `entry.sh` を通り、型を誤った ALTER も起動する。`spec/server.md:17` に誤り | 中 |
| 35 | スキル名・コマンド名の記録 | 同梱物は `governance:名前` と `plugin`、利用者のものは素の名前と `userSettings`。`/compact` は command_name に残らない | 低 |
| 36 | サブエージェントと context_tokens | context_tokens は PreCompact・Stop だけ（9/9）。agent_id で親子を区別できる。Agent を使うと、入力 1 回で UPS と Stop が 2 組出る | 低 |
| 38 | 本文を送らないことの監査 | 12 シナリオ・全経路で漏れ 0 件。陽性対照 4 種は検出した | なし |
| 39 | 長い値・特殊文字 | SQLite では巻き込み無し。深い入れ子で 500（仕様違反）。MySQL が utf8mb4 以外だとリクエスト全体が 500（MySQL 採用時の条件） | 中 |
| 41 | 収集の停止と再開 | 無効化中は積まないので、再開後に漏れない。`"0"` も無効化（文書どおり） | なし |
| 43 | hook の処理時間と起動の遅延 | hook の処理は 30〜60 ms。シム経由の起動が支配的（1 回約 0.39 s）。高負荷で最大 5.95 s | 中 |
| 46 | 停止からの回復と再送 | 取りこぼし 0。応答を失ったとき重複が各 1 件（画面は水増しされない）。HTTP エラーの間は error 行が k(k+1)/2 で増える。`docker stop` は SIGKILL で終わる | 中 |
| 47 | spool の上限と長期オフライン | 上限での破棄は記録されない（受け入れ済み）。前段が 413 で切ると詰まる（スタブ）。`config.json` が無いと queue が増え続ける | 低 |
| 50 | 本番の送信先を埋めて E2E | 12 件が同じ例外で落ち、7 件通った。`release.md` と E2E が両立しない。`validate_plugin.py` と `pytest tests` が本番へ POST しうる（推定）。DNS の失敗は記録されない | 高 |
| 55 | 版の混在・版の上げ忘れ | `ts` を改名した版は event 行が全損する（`pytest tests` で止まる）。版を上げない再 publish は `plugin update` で届かない | 中 |
| 60 | 撤去と再導入 | uninstall は未送信の queue・spool・既読を消す。`statusLine` と配った値は残る | 中 |
| 68 | CSV の取り込み（任意の補強） | 件数と合計は正しい。同じ日を部分的に含む別ファイルがその日を置き換える。書式が変わると成功表示のまま NULL になる | 低（CSV を使う場合） |
| 76 | 画面の性能 | 1 年分・200 名（313 万行）で 0.1〜1.8 s。error 行 70 万行で概況が 6.9 s | 中 |
| 77 | 一斉起動の受信負荷 | 140 同時でも 5xx・取りこぼし 0。実セッション 20 並列で SessionStart の行が無言で欠けた。ロックが SQLite の busy timeout（既定値）を超えると 500 | 中 |

## 4. 重要な発見の詳細

### 4.1 送信先の置き場と本番への誤送信（UC 50、D2・D3・D5、高）

- 手順の食い違い（事実。コードと文書）: `release.md:13` は初回リリースの前に `plugin/config.json` の `ingest_url`・`ingest_token` を埋めさせ、`:31` で `plugin/` を配布側へ丸ごと置き換え、`:50` の `diff -r` で一致を求める。一方 `e2e/_market.py:65,73-77` はローカル以外の送信先で publish を拒む。このため本番の値を入れた後は `pytest e2e` が 12 件落ち、`release.md:11` の前提を満たせない。`decisions/plugin.md:112`「空のまま置く」とも食い違う。配布側の `config.json` はまだ空なので、害は出ていない
- 決定: 案 A（2 章）。E2E の組み立てで送信先を差し替え、`test_install.py:74-76` の比較から `config.json` を外す
- 案 A で表に出る誤送信（推定。経路はコードで確認、到達は未実測）
  - `validate_plugin.py`: 隔離するのは `CLAUDE_PLUGIN_DATA`・`CLAUDE_CONFIG_DIR` だけで、`CLAUDE_PLUGIN_ROOT` は開発ツリーの `plugin/` である（`scripts/plugin_checks/hooks.py:96-99`）。Stop の時点で queue があり `sent_at` が無いので送信プロセスが起動し（`_spool.py:80-94`）、`plugin/config.json` の送信先へ POST する（`_sender.py:17,90-100`）。隔離ディレクトリの `rmtree`（`hooks.py:132-133`）との競合次第だが、送られる公算が大きい。リリースのたびに架空の利用者（`validate-plugin-py@example.invalid`、host は実機名）が本番 DB に増える
  - `pytest tests`: `tests/plugin/client/conftest.py:31` の `hooks_dir` は実物の `config.json` を複製する。`write_config` を呼ばない Stop のケース（`test_collect_exit_code.py` の `_COLLECTING_CASES` など）は、同じ理由で送信プロセスを起動し、複製した本番の送信先へ POST する
- 受け入れ済みの限界: 送信先が空のまま配っても自動では検出しない（`decisions/plugin.md:106-108`）。E2E が本番の送信先を通らないのも範囲外と明記済み（`e2e.md:156`）。これは E2E の判定の穴ではない
- 設計上の帰結（受け入れた記録は無い）: 名前解決・プロキシのトンネル・本文を読まない 413 の失敗は `URLError` になり、error 行に残らない（`_sender.py:71-77`、`spec/plugin.md:67-68`）。防御はリリース前の人の確認だけで、staging で実際に届いたかも見ていない（`_spool.py:89-90` により最初のセッションで即座に送るので、確かめられる）

### 4.2 本体による settings.json の読み捨てと hook の全停止（UC 01・13、高）

- 症状（事実）: 本体の検証を通らない箇所が 1 つでもあると、本体はファイル全体を黙って無視する。`enabledPlugins` も読まれず、`plugin list` は `enabled: false`、hook は 1 本も起動しない。policy・event・error の行はどれも 0 件。`-p` の stderr・stream-json・終了コード・`--debug-file` に何も出ず、気づく手段は `claude doctor` の `Invalid settings` だけである
- 条件（事実）: 型違い（`cleanupPeriodDays: "30"`・`env: "broken"`）、壊れた JSON（途中で切れた・末尾カンマ・空・トップが配列か null）、2 MiB 超（2,097,142 バイトは読み、2,097,162 バイトは読まない）、宙づりのリンク。BOM 付き・Latin-1 は本体が読み、プラグインは `parse_failed` になる
- 配った値が原因のとき（事実）: `SET` に `cleanupPeriodDays: "30"` を入れると全停止し、直した版に `plugin update` しても `enabled: false` のまま戻らない（uc-01 R4 s4）
- 既存の防御（事実）: `test_適用結果がスキーマに通る`（`tests/plugin/test_policy_schema.py:57-68`）が、実物の `policy.py` の適用結果を schemastore のスキーマで検証し、型違い・set の値・キー名の誤りを落とす。残る経路は、schemastore が通して本体が捨てる値（実在は未確認）と、fixture（2026-09-25 取得）が古くなった後の上流の厳格化である。逆向きのずれ（env の int を本体は受け付け、schemastore は拒む）は実例がある
- 欠けているもの: 復旧手順が報告書にも `release.md` 10 章（`:127-133`）にも無い。復旧は「直した版を先に出す → 利用者が `claude doctor` の名指しのキーを直す」の順で、逆にすると旧版の hook が同じ値を書き直す（推定）
- 監視の読み方: 導入どおりの状態で `parse_failed` が届くのは BOM 付きと Latin-1 だけで、`parse_failed` が 0 件でも壊れた端末が無いとは言えない

### 4.3 無言の全損: 同名モジュールと契約違いの行（UC 31・55、中）

- 同名モジュール（事実）: `plugin/hooks/` に `json.py` か `uuid.py` を置くと、hook は exit 0・stderr 空・行 0・error 行 0 で無言になる。`typing.py`・`pathlib.py` は import が try の外（`collect.py:11-20`）なので exit 1 とトレースバックになる。`validate_plugin.py` の `check_stdlib_only` は自モジュールを許し（`scripts/plugin_checks/files.py:105,127`）、Python 3.10 未満では SKIP になる（`:97-102`）。規約（`decisions/plugin.md:37-39`）はあり、`-k collect` は落ちるが、メッセージから原因は読めない。今の stem に衝突は無い
- 契約違いの行（事実）: `ts` を `timestamp` に改名した版の event 行は 4 行中 0 行しか入らない。サーバは `dropped` に数えて 200 を返し、端末は spool を消す。ただしこの改名は `tests/plugin/test_contract_constants.py:16-39` で落ちる
- 版の上げ忘れ（事実）: `version` を上げずに publish し直すと、`plugin update` は「already at the latest version」と答え、中身は旧いままになる。サーバから検出できないことは `release.md:20` に既にある。新しいのは上流の挙動と、uninstall→install で直ることである

### 4.4 送信の失敗・破棄・撤去の見えにくさ（UC 46・47・60、中）

- error 行の二乗の増加（事実）: HTTP のエラー応答（401・404・413・5xx）では次のファイルへ進むので（`_sender.py:68-70,97-100`）、送信 1 回ごとに spool の全ファイルを POST し、その数だけ error 行を積む。k 回で k(k+1)/2 行、k=40 で 820 行（イベント 320 行の 2.6 倍）。今の `spool_max_bytes` と送信の間隔（`_spool.py` の `DEFAULT_FLUSH_INTERVAL_SEC`）で外挿すると、約 180 回の送信（約 30 時間の利用）で上限に達し、本物のイベントを押し出し始める。2 章の上限では延びるが、二乗の増加は変わらない（外挿）
- 5xx の扱いの両面（推定）: 打ち切ると 1 本の毒ファイルで後続が止まる（UC 39 のコードからの推定）。打ち切らないと全体障害を増幅する（UC 77 のロックによる 500 では、全端末が全ファイルを 1 本ずつ送る）
- 回復（事実）: 取りこぼし 0。drop・hang で重複が各 1 件出たが、4 画面の HTML 差分は 0 行だった。送信先を変えると溜まった分はすべて新しい送信先へ行く（`_sender.py:57`）
- 上限での破棄（事実）: `spool_max_bytes`・`spool_max_days` を超えると mtime の古い順に消し、記録は無い。損失は受け入れ済み（`spec/plugin.md:62-63`）だが、`release.md:56,58` の「401 の間もイベントは失われない」は誤りである
- その他（事実）: 前段が本文を読まずに 413 で切ると無言で詰まる（スタブでの結果。AIP の前段の上限は未確認）。`config.json` が無いと rotate も prune も走らず queue が増える（`_sender.py:91-93`。壊れた JSON は validate が止めるので、残るのはファイルが無い場合だけ）
- 撤去（事実）: `plugin uninstall` は data ディレクトリを消し、未送信の queue・spool・既読が失われる（`--keep-data` で残る）。`statusLine`・配った値・`governance/` は残る
- 途絶えの見え方（事実。コード）: `/policy` の途絶えの表示（`queries_policy.py:89-100`）はあるが、判定は `constants.py` の `STALE_DAYS` で、今は `spool_max_days` より長い（2 章の決定の後は同じになる）。一度も届かない端末は途絶えにならず、CSV があれば「未導入」に混ざる。概況の件数の急落（`system.md:94-95`）は 200 名中 1 台の停止を見分けない

### 4.5 同時起動・高負荷での SessionStart の打ち切り（UC 14・43・77、中）

- 事実（UC 14）: 同じ config で `claude -p` を一斉に 20 本以上起動すると、SessionStart hook がほぼ全部 `outcome: cancelled` になり、その回の適用が抜けた。15 本は load 44 でも全部 success、0.5 秒ずつずらせば 30 本でも 0。`cancelled` でも最後まで走り、書き込みと policy 行が届いた回がある
- 事実（UC 77）: 実セッション 20 並列で SessionStart の行が 1 つも届かず、error 行も無かった。`session_start.py` を単体で 40 本同時に動かすと 39〜40 本が今の `timeout`（`hooks.json`）を超えた。打ち切りが行の追記より前で起きたかは推定である
- 事実（UC 43）: hook の処理は 30〜60 ms、SessionStart の全段で約 80 ms。起動は導入なし 0.80 s・導入あり 1.96 s・シムを飛ばすと 1.01 s。load 36〜47 でシム経由の hook が最大 5.95 s。送信先が閉じている・遅い場合も起動は延びない
- 原因: 打ち切りの原因は切り分けていない。UC 77 の単体の所要（p50 0.46〜0.49 s）はシムの経由と整合し、寄与した可能性が高い（推定）。実運用ログで SessionStart が 4 秒前後の例が既に 2 件ある（`measurements.md:93`）
- 位置づけ: 取りこぼしは受け入れ済み（`decisions/plugin.md:139-141`）。緩和は `hooks.json` の `timeout` の延長で行う（2 章の決定）。collect の hook の処理自体も高負荷で今の `timeout` を超えた（UC 43 の実測 5.95 s）。本体の下で打ち切られて行が欠けるかは推定
- 偽の赤: 並行の負荷（load 13〜18）の中で E2E が赤になった。打ち切りが原因と確かめたのは UC 06 だけで、UC 12・50 は推定である

### 4.6 既存 E2E の判定の穴（UC 06・46・31・77、中）

- 撤回（事実）: `test_SETが入り本体の書き込みも残る` は None を壊した実装でも合格する（`_dig` が「キーが無い」を None とみなす、`e2e/test_settings.py:33-39`）。REMOVE はそもそも判定対象に無い（`:66-68`）。policy 行の `applied` は撤回の証拠にならない
- 偽の赤（事実・一部推定）: `test_2回目は適用済みで本体に取り込まれる`（`:84-85`）は SET の None・ADD で落ち、REMOVE・ONCE でも落ちる（推定）。SET の None は `release.md:129` の撤回手順そのものなので、最初の撤回リリースで E2E が赤になる
- 打ち切り: `e2e/_flow.py:51-60` は `outcome` を見ない。stream-json に `cancelled` が出ることは確認したが、判定を実装して落ちることは確かめていない。`ask()` の経路（`:42-48`）は stream-json を付けないので見られない
- 送信の失敗（事実）: `test_send` は error 行を `{(stage, error_type)}` の集合で比べ、失敗も 1 回しか起こさない（`e2e/test_send.py:43-45`）
- 収集（事実）: キーパスは全行を通して 1 つ以上で合格する（`test_collect.py:46`。限界は `e2e.md:134-136` に記載済み）

### 4.7 error 行と画面の遅さ（UC 46・76、中）

- 事実（UC 76）: 1 年分・200 名（313 万行・1.49 GB）で 4 画面は 0.1〜1.8 s。直近 7 日に error 行 70 万行を足すと概況が 6.9 s（うち `error_summary` が 5.7 s）。原因は `queries_errors.py:7-29` の窓関数 2 本による全行の並べ替えである
- `errors` には索引が無い（`db.py:18-30`）。SQLite の ANALYZE は全表が対象で、`_TABLES` から外れて効かないのは MySQL の ANALYZE TABLE と索引の作成だけである
- `/effect` は 5 列の索引が無いと 120 s を超える。索引は起動のたびに `db.init` が作るので、作れない場合に限る。MySQL 8.4 の既定（DYNAMIC・utf8mb4）では全索引を作れた（UC 39）
- 影響（推定）: 壊れた版やトークンの誤りを配ったときこそ概況を見るのに、そのとき最も遅くなる。4.4 の送信の修正が入れば緊急度は下がる

### 4.8 サーバの無言のドリフトと堅牢性（UC 32・39・77、中）

- 列の追加（事実）: 起動を止めるのは ALTER 忘れと列名・表の誤りだけ（`db.py:124-136,150-158`）。同期忘れは `entry.sh:44-71` の照合を通る（複製とハッシュ記録が一致したまま）。捕まえるのは `sync_contract.py --check` と `tests/integration/test_contract_sync.py` である。型を誤った ALTER も起動する（`db.py:104-110` は列名だけを取る）。端末だけ新しい期間の値は戻らない
- 深い入れ子（事実）: 10 万段の入れ子で `RecursionError` になり 500 を返す（`ndjson.py:48-51` は `ValueError` だけを捕まえる）。`spec/server.md:32-33`「リクエスト全体は失敗させない」に反する
- MySQL（事実）: utf8mb3・latin1 の表では 4 バイト文字 1 字でバッチ全体が `DataError 1366` になる。DDL は `server/ccgov/vendor/contract.py:193-195` が方言によらずに作り CHARSET を持たない。今のデプロイ手順は SQLite（`deploy-aip.md:8`）なので、MySQL を採る前の条件として扱う
- ロック（事実）: `sqlite3.connect` の busy timeout は既定 5 秒で、超えると `/ingest` が 500 になる（`db.py:65-67`）。長い読み取りで画面の `/` も 500 になった。ANALYZE の失敗で保存済みの行が 500 になる隙間もある（推定・頻度は低い）
- `event_id` が NULL の行と `ts=1` の行は検査を通るが、端末は正しい値を送るので実害の経路は無い

### 4.9 CSV の取り込み（任意の補強、UC 68、中）

- 置き換え（事実）: 冪等キーが `day` で、ファイル名の昇順に「その日を消して入れ直す」（`csv_import.py:94-112`、`spec/server.md:41`）。7 月分に 1 行だけの訂正版を足すと 3,144 行が 3,001 行、利用者は 140 人から 138 人に減り、画面は両方に「成功」と出した。ただし日次と週次の同一の重なりは正常な運用（`server/tests/fixtures/`）なので、重なりを警告すると誤警報になる。損失が起きるのは、同じ日を部分的にしか含まないファイルがあるときである
- 書式の変化（事実）: 同名の `Cost` 列・`$` 付き・`123.0` 形のトークンは成功表示のまま NULL か 0。全行を破棄したファイルも緑の枠（`overview.html:66-69`）。空の `User Email` は 1 人に数え、`.CSV` は無視する。実 CSV は月で `Date` の書式が変わる（7 月 `YYYY-MM-DD`・8 月 `YYYY/M/D`）が、実装は両方を読める
- CSV が無い状態（静的な確認）: `CSV_DIR` は任意（`config.py:35`）。起動・受信・概況・`/policy`・`/effect` のコンテキスト分布・`/assets` は events と policy_state だけで成り立つ。値を持たないのは突合率・日次コスト・準拠率（判断 15 で分母が cost_daily）・未導入者・効果測定のコストである。準拠率は端末基準に切り替える（2 章）。テストは空の DB での `/`・`/policy`・`/assets` だけで、`/effect` と「events はあるが CSV は無い」状態は見ていない

### 4.10 `_settings.py` の書き込みまわり（UC 06・12・13・14、中〜低）

| 箇所 | 症状（事実） | 位置づけ |
| --- | --- | --- |
| `_settings.py:76-80`・`_govdir.py:62` | バックアップを置換の前に取るので、置換の失敗（uchg）や A3 のたびに増え、`_govdir.py` の `_BACKUP_KEEP` の世代数を超えると本物を押し出す | 仕様の「戻せる」に反する単純なバグ（D1-03） |
| `_policy_ops.py:146-152`・`_settings.py:103-105` | ADD と REMOVE に同じ要素があると、毎セッション書き込みとバックアップを行う | `spec/plugin.md:89`「差分が無ければ書かない」に反する（D1-04） |
| `_settings.py:110-116` | ONCE の記録は今の組だけを持ち、前の値へ戻すと利用者の値を再び上書きする | 仕様が曖昧（`spec/plugin.md:85`）。文書で決める |
| `_settings.py:60-69,82` | JSON に書けない値で `TypeError` が素通りし、0 バイトの `.settings-*.tmp` が残る | 既存のスキーマ検査が set の値を止めるので実害は小さい（D1-06） |
| `_settings.py:60,80` | `mkstemp` の 0600 で置き換え、元の権限を失う | バックアップと同じ方針で害は小さい。採らない |
| `_settings.py:59` | 宙づりのリンクの先にファイルを作る | プロジェクト設定で有効化したときだけ到達する。採らない |
| `_settings.py:72-80` | 検査から置換までの窓の他者の書き込みが消える（`probe_window.py` で決定的に再現） | hook 同士は無害。採らない |

### 4.11 収集の上流の事実の訂正（UC 35・36・38）

- 送るもの: 本文は送らない。利用者由来の値で送るのは、管理対象キーの prev_value（スカラだけ）、スキル名とコマンド名（契約の列幅まで。`spec/plugin.md:29-32`）、host（`platform.node()`）、user_email である
- `command_source` の観測値は `userSettings`（利用者）と `plugin`（同梱）の 2 つで、プロジェクトと managed は未確認
- Agent を使ったターン: 入力 1 回で UPS と Stop が 2 組出る。Agent の PostToolUse が子の Bash より 7 秒前に出ており、Agent は子の完了を待たずに戻った（推定）。プロンプト数とターン数は水増しされるが、サーバは UPS・Stop を件数として集計していない（`admin.py:148` の分布だけ）

## 5. 改善案

根拠の D*-NN は `analysis/dN-verification.md` の 4 章、UC は `uc-*/notes.md` を指す。

### 5.1 リリース前（P1）

| ID | 観点 | 内容 | 優先度 | 根拠 |
| --- | --- | --- | --- | --- |
| P1-1 | 設計見直し・E2E | 案 A の実装: `_market.publish` が overrides に `config.json` が無いとき `ingest_url`・`ingest_token` を空にして組み立てる（`_check_ingest_url` は残す）。`test_install.py:74-76` の比較から `config.json` を外す。`decisions/plugin.md:112` を改め、`e2e.md:61` 付近に差し替えを書く。本番らしい送信先を入れたコピーで `pytest e2e` が全件通ること、差し替えを外すと `_check_ingest_url` で落ちることを確かめる | P1 | UC 50、D3-01・D5-01 |
| P1-2 | バグ修正（検査の隔離） | `validate_plugin.py` の hook 実行の前に、隔離した plugin-data に `sent_at` を作って送信を止める。送信先を埋めたコピーで POST が出ないことを確かめる | P1 | UC 31・50、D2-18 |
| P1-3 | テスト（隔離） | `tests/plugin/client/conftest.py` の `hooks_dir` は、実物の `config.json` を読み `ingest_url`・`ingest_token` だけを空にして書く（P1-1 と同じ形）。送信先にローカルの受け口を入れたコピーで `pytest tests` を流し、何も届かないことを確かめる | P1 | 4.1（監督が追加。精査の D* には無い。コードからの推定） |
| P1-4 | 文書・運用 | `release.md` 10 章に、本体の検証で捨てられる値を配ると配り直しでは戻らないことと、復旧の順序（直した版 → `claude doctor` で名指しのキーを直す）を書く | P1 | UC 01、D1-01 |
| P1-5 | 運用 | `release.md` 7 章に、staging のセッションの後に確かめる項目を足す: (1) 概況の版の分布に上げた版が出る（行が届いた証拠）。(2) 出なければ staging の端末の plugin-data の `queue.jsonl`・`spool/` にある `send` の error 行で原因（`HTTP 401` など）を見る。401 の間は error 行も届かないので、概況に「失敗が無い」ことは合格の証拠にならない。staging の行（開発者本人）が本番 DB に入るのは許容とする（要確認）。会社 PC で行えばプロキシの経路も通る | P1 | UC 50・46、D3-03 |

### 5.2 運用開始後の早め（P2）

| ID | 観点 | 内容 | 優先度 | 根拠 |
| --- | --- | --- | --- | --- |
| P2-1 | 設定 | `hooks.json` の `timeout` を SessionStart 60 秒・収集の hook 10 秒にする（決定済み。次のリリースに同梱できる）。`decisions/plugin.md:139` の数値を名前に置き換える | P2 | UC 14・43・77、D2-10・D3-06 |
| P2-2 | バグ修正・設定 | error 行を送信 1 回につき状態コードごとに 1 行へ集約し、401・403・404 は打ち切り、5xx は連続して返ったら打ち切る（回数は提案値。定数名を付けて置く）。単体テスト 3 本（k 回で k 行・毒ファイル 1 本で後続が届く・全件 500 で打ち切る）。同時に `spool_max_days`・`spool_max_bytes` を 2 章の値にし、`spec/plugin.md:56-57` と `decisions/plugin.md` の送信の節を更新する | P2 | UC 46・39・77、D3-04 |
| P2-3 | 文書 | `release.md:56,58` の「401 の間もイベントは失われない」を直す（`spool_max_days`・`spool_max_bytes` で失われ、error 行の増加が押し出しを早める） | P2 | UC 46、D3-02 |
| P2-3b | 文書 | `release.md` に追記: 10 章に ADD と REMOVE の重なりと、ロールバックで ADD と ONCE の上書きが戻らないこと。6 章の同期の項目に `contract.py`。11 章の「起動しない」を ALTER 忘れに限り、型の一致・ALTER の実行手段（イメージに `sqlite3` CLI は無い）・端末を先に配ったときの欠損を足す | P2 | UC 06・32、D4-08 |
| P2-4 | バグ修正 | `_govdir.backup` で、直前と同じ内容ならバックアップを取らない | P2 | UC 13・06、D1-03 |
| P2-5 | 仕様・テスト | ADD と REMOVE の重なりを、`test_定義の形` で禁止するか、「適用後の dict が元と等しければ書かない」にするか、どちらか一方で止める | P2 | UC 06、D1-04 |
| P2-6 | テスト（E2E） | `test_settings.py:84-85` を SET の None・ADD・REMOVE でも成り立つ形に直し、既存値のある端末からの撤回を 1 本足す（`uc-06/scenarios.py` の A・B が雛形。判定は settings.json の中身）。**最初の撤回リリースより前に**入れる | P2 | UC 06、D5-04 |
| P2-7 | 検査 | `check_stdlib_only` で `plugin/**/*.py` の stem が `sys.stdlib_module_names` にあれば NG。3.10 未満の SKIP を NG にするか `release.md` 3 章に 3.10 以上を書く。hook ごとに queue と spool の行の和が増えたかを見る（P1-2 の `sent_at` の上で）。壊したコピーで落ちることを確かめる | P2 | UC 31、D2-01・02・03・04 |
| P2-8 | 運用・知識 | `policy.py` の SET・ONCE に新しいキーを足したら schemastore の fixture を取り直す手順を `release.md` に 1 行、ずれの実例を knowledge に書く | P2 | UC 01、D1-02 |
| P2-9 | 文書（仕様） | `spec/plugin.md` に足す: 本体が読めない settings.json ではプラグインが起動しない、uninstall で既読と未送信分が消える、ONCE の記録は今の組だけを持つ（前の値へ戻すと再び 1 回書く）、送るものの一覧（4.11） | P2 | UC 01・06・13・38・60、D1-05・D2-11 |
| P2-10 | 仕様・サーバ | CSV が無いときの準拠率を「policy 行が届いた利用者」を分母に出し、「未導入者は含まない（CSV があれば含める）」と注記する。判断 15（`decisions/server.md:31`）と `spec/server.md:61-64` を改める | P2 | 方針、D4-01 |
| P2-11 | テスト（サーバ） | events と policy_state はあるが cost_daily が空の DB で、`/effect` を含む 4 画面が 200 を返し CSV に依らない表が埋まることを見る | P2 | 方針、D4-02 |
| P2-12 | バグ修正（サーバ） | `parse_line` で `RecursionError` も破棄に数える | P2 | UC 39、D4-05 |
| P2-13 | バグ修正・性能 | `db.connect()` の SQLite に `timeout` を明示する（`config.json` の `timeout_sec` より短く）。別接続が 6 秒ロックを握っても受信が 200 になるテストを置く | P2 | UC 77、D4-06 |
| P2-14 | 性能 | `error_summary`（`queries_errors.py`）を先に `GROUP BY` する形に書き換える。索引は従 | P2 | UC 76、D4-07 |
| P2-15 | 文書（サーバ） | `spec/server.md:17`（同期忘れは検出しない）・`entry.sh:66-69` の文言・`system.md:96`（NULL 率は 4 列）を直す。`system.md:94-95` と `spec/server.md:63-64` に限界を書く: 途絶えは `STALE_DAYS` の経過後に出る。一度も届かない端末と 1 台の停止は見えない | P2 | UC 31・32・47・55、D4-09、4.4 |
| P2-16 | 運用（CSV を使う場合） | `deploy-aip.md` に CSV の運用規則: 1 ファイルはその日の全行を含む・ファイル名は日付順・消したファイルの行は DB に残る | P2 | UC 68、D4-03 |
| P2-17 | e2e スキル | 案 A に合わせ、「5. staging を確かめる」の手前の確認を「開発ツリーは本番値、E2E は組み立てで差し替える」にする。一時スクリプトで `plugin/` を複製するときは送信先を差し替えることを「踏みやすいところ」に書く | P2 | UC 50、4.1 |
| P2-18 | 文書 | 既存 `docs/` の設定値の直書きを名前に置き換える: `remaining/deploy.md:30`（`timeout_sec`）・`remaining/known-issues.md:10`（`POLICY_DAYS`）・`spec/dashboard-style.md:27`（`RECENT_DAYS`・`STALE_DAYS`・`POLICY_DAYS`）。`decisions/plugin.md:139` は P2-1 で行う。上流の挙動の値（`release.md:120` の自動更新の所要など）は対象外 | P2 | 方針 |
| P2-18b | 知識 | 7 章のうち UC 31・36・43 の分を `docs/knowledge/` に足す | P2 | D2-07・08・09 |

### 5.3 あれば良い（P3）

| ID | 観点 | 内容 | 優先度 | 根拠 |
| --- | --- | --- | --- | --- |
| P3-1 | バグ修正 | `_write` の一時ファイルを例外の種類によらず `finally` で消す | P3 | UC 12、D1-06 |
| P3-2 | 文書（利用者向け） | 撤去手順（送信を済ませるか `--keep-data`・`statusLine` を外してから `governance/` を消す・配った値は手で消す） | P3 | UC 60、D1-07 |
| P3-3 | 送信 | `config.json` が無いときも rotate・prune を行う。`rotate` の後の fd への追記の喪失（推定）を issues に記録する | P3 | UC 46・47、D3-08・11 |
| P3-4 | サーバ | `entry.sh:75` を `exec waitress-serve` にする。ANALYZE の失敗を受信の失敗にしない。破棄した行の件数を理由ごとにログへ出す | P3 | UC 46・39・55、D3-09・D4-13・14 |
| P3-5 | CSV を使う場合 | 全行破棄を `err` の枠で出す。空の `User Email` を NULL に、拡張子の大小を問わない。同じ日の行の集合が一致しないときだけ警告する（「重なりでは出ない」テストと対で） | P3 | UC 68、D4-04・11・12 |
| P3-6 | 画面 | NULL 率に、存在が保証される列（`session_id`・`prompt_id`・`permission_mode`）だけを分母付きで足す | P3 | UC 31・55、D2-06 |
| P3-7 | E2E | `session()` で `outcome` が `cancelled` なら「打ち切り」と名指しして落とす（`timeout` 延長後はまれ）。`test_notices` の空の出力にも同じ説明。`test_collect` で全 hook が 0 行なら import の失敗を疑う旨を出す | P3 | UC 06・31・77、D5-02・D2-05 |
| P3-8 | E2E | `test_send` で自分の `event_id` の値と型を queue と DB で突き合わせる。本体が捨てる settings.json で `hook_rows` が空・バイト不変を見る（上流の変化の合図）。`test_leak` のシナリオ追加と送信の生バイトの走査 | P3 | UC 32・01・13・38、D5-03 |
| P3-9 | E2E（CSV を使う場合） | 取込の再取り込みで件数不変・必須列の欠落で失敗表示。見本 CSV に 8 月の書式を 1〜2 行 | P3 | UC 68、D5-09 |
| P3-10 | E2E の部品 | `E2ERoot` の接頭辞を `CC_E2E_RUN` から作る。`DockerServer.sql()`・`request` のタイムアウト。`hook_rows` の docstring に「送信済みの行は端末から消える」 | P3 | UC 01・12・13・46・68 |
| P3-11 | 文書（E2E） | `e2e.md` に `CC_E2E_RUN`（同時に動く実行ごとに一意）・`:179-180` の `cc-e2e=1` の修正・判定が SET だけの policy を前提にすること・`permission_mode` は `--permission-mode` で変わること・並行起動の目安と偽の赤・`_quiet` の静止時間（`_QUIET_SEC`）の前提を書く | P3 | UC 14・31・39・43、D5-05・06・D2-12 |
| P3-12 | 知識・テスト | `command_source` の観測値と `/compact` が UPE を経ないことを knowledge に。fixture を `sanitize_fixtures.py` で採り直し `userSettings`・agent_id の行を入れる | P3 | UC 35・36、D2-13・14 |
| P3-13 | 運用・文書 | 「起動が遅い」の切り分け手順（`command -v python3`・`time python3 -c pass`）。`spec/plugin.md:18`「常に exit 0」に自モジュールの import の失敗は含まないと注記。`session_start.py:77` の docstring を「`sdk-` 始まりでは何もしない」に直す | P3 | UC 43・24・31、D2-15・17 |
| P3-14 | 知識 | `-p` が `CLAUDE_CODE_ENTRYPOINT` を上書きするのは `cli` と空だけ、を `claude-code-behavior.md:41` に。urllib がプロキシ変数に従い、トンネル・名前解決・413 が `URLError` で記録されないこと | P3 | UC 24・50、D1-08・D3-07 |
| P3-15 | 運用 | 保留事項の整理: 今回の保留（5.4）と既存の散らばった保留を、`decisions/*` の「条件が変われば再検討すること」と `remaining/` に振り分け、同じ事項を 1 か所にだけ置く | P3 | 方針 |
| P3-16 | e2e スキル | 一時スクリプトを `.local/<作業名>/` に書き、判定の自己検査を先に走らせ、壊した実装で落ちることを確かめ、`CC_E2E_RUN=<トラック>-<作業名>` を付ける、の型を明示する。`pgrep -f` が自分のシェルに一致する罠（`[p]ytest` の形）を書く | P3 | 全般・UC 50 |
| P3-17 | 仕様・知識 | 版の分布は `(user_email, host)` ごとの最新 1 行で数え、user_email が NULL の端末は host ごとに 1 台へ潰れる、を仕様に書く。「spool は宛先を持たず、送信時点の宛先へ全部送る」を `spec/plugin.md` に 1 行足す（サーバ移行の運用のため） | P3 | UC 55・46、D4-15・D3-10 |
| P3-18 | E2E | 「送信先が空の版で積み、送信先を入れた版に上げると積んだ分が届く」を 1 本足すか判断する（初回に本番の値を入れるリリースに関係する） | P3 | UC 47、D5 3 章 |

### 5.4 将来の検討事項（保留）

| ID | 内容 | 再検討の条件・置き場 |
| --- | --- | --- |
| H-1 | 古い生データの日次集計への圧縮などの量の対策 | 量が問題になったとき。`decisions/server.md` の「条件が変われば再検討すること」 |
| H-2 | SessionStart の行の追記を前へ移す | `timeout` 延長後も欠けが観測されたとき。効果は未確認（全件打ち切りの段では `statusline.js` すら作られていない、UC 14） |
| H-3 | 端末ごとの「最後に届いた時刻」の一覧 | P2-15 の限界の記述で運用が回らないとき |
| H-4 | 送信プロセスの多重起動の排他 | 重複の送信が実害になったとき（UC 43 で遅いサーバに POST 27 回。推定） |
| H-5 | MySQL の `DEFAULT CHARSET=utf8mb4` と起動時の文字コード検査 | MySQL を採るとき（採用時のゲート。`deploy-aip.md` に条件として書く）。D4-10 |

### 5.5 採らないこと（理由）

| 案 | 理由 |
| --- | --- |
| `conftest` で本番の送信先を検出して E2E を止める・開発ツリーを空にする案（B・C） | 利用者が案 A を選んだ。C は開発ツリーで E2E が流せなくなる |
| 配る送信先の値の機械検査 | 自動で検出しないことは受け入れ済み（`decisions/plugin.md:106-108`） |
| spool の上限での破棄を error 行で残す | 損失は受け入れ済み（`spec/plugin.md:62-63`） |
| `test_policy_schema.py` に型の検査を足す | 既にある（`test_policy_schema.py:57-68`） |
| 権限の保持・BOM の読み込み・2 MiB の自己超過の防止・`SystemExit` の保護・`save_once` などの原子化・検査と置換の窓 | 病的な入力か観測されていない競合で、仕様の意図に反する単純なバグではない（D1 4 章） |
| 既読を書く条件の許可リスト化（UC 24） | 受け入れ済み（`decisions/plugin.md:80-84`） |
| `hooks.json` の `python3` の固定 | 受け入れ済み（`decisions/plugin.md:76`） |
| NULL 率を全 12 列に広げる | SessionStart などで欠ける列が常に誤警報になる |
| event 行に plugin_version を足す | policy 行での近似で足りる（YAGNI） |
| `event_id`・`ts` の検査の厳密化、宣言型の照合、`MAX_CONTENT_LENGTH`、EXPLAIN の回帰テスト | 実害の経路が無い、または手順と起動時の索引作成で足りる（D4 4 章） |
| CSV の値の形の検出・同名ヘッダの拒否・末尾の空行・`/ingest` の小文字化 | CSV は任意の補強で、影響が小さい |
| 重複の行・NULL 化の無言・知らない kind の破棄の検出 | 受け入れ済み（判断 6・`spec/server.md:35-36`・`release.md:139`） |
| 端末側での集計・粒度の段階・gzip | 今の量は小さい（決定済み） |
| 同時起動・画面の性能・受信の負荷・時間の判定の E2E への昇格 | 揺れが大きく、無言で壊れる種類でもない。組み合わせの網羅は `tests/`・`server/tests` が安い |
| e2e スキルへのユースケース別ワークフロー（`references/`） | スキルは実行用で、E2E を書く作業は範囲外（`SKILL.md:3`）。負荷試験はまれ |
| `.local/` のユースケース集の修正 | 一時領域である |

## 6. 既存の文書・実装との不整合

| 箇所 | 内容 | 直し方 |
| --- | --- | --- |
| `release.md:13,31,50` と `e2e/_market.py:73-77`・`decisions/plugin.md:112` | 本番の値を開発ツリーに置く手順と、E2E の合格・判断記録が両立しない | P1-1 |
| `scripts/plugin_checks/hooks.py:96-116`・`tests/plugin/client/conftest.py:31` と CLAUDE.md「検証の送信先を本番に向けない」 | 隔離が送信先に及ばない | P1-2・P1-3 |
| `release.md:127-133`（10 章） | 型違いの復旧、ADD と REMOVE の重なり、ロールバックで戻らないものが無い | P1-4・P2-3 |
| `release.md:56,58` | 「イベントは失われない」は誤り | P2-3 |
| `release.md:48`・`:137` | 同期の項目に `contract.py` が無い。「順序を誤ると起動しない」は ALTER 忘れにしか当たらない | P2-3 |
| `decisions/plugin.md:139` | `timeout` を数値で書いている | P2-1 で名前に |
| `spec/plugin.md:56-57` | 「HTTP のエラー応答なら次のファイルへ進む」 | P2-2 と同時に改める |
| `spec/plugin.md:58`・`_sender.py:95` のコメント | `config.json` が無いときは退避も破棄も行わない | 明記するか P3-3 |
| `spec/plugin.md:85` と `_settings.py:110-116` | ONCE の「組ごとに 1 回」と「値を変えれば再度 1 回」の関係が曖昧 | P2-9 で「今の組だけを持つ」と明記 |
| `spec/plugin.md:89` と `_policy_ops.py:146-152` | 「差分が無ければ書かない」が ADD と REMOVE の打ち消しで成り立たない | P2-5 |
| `spec/plugin.md:11-12` | uninstall で状態（未送信分を含む）が消えることが無い | P2-9 |
| `spec/plugin.md:18` と `collect.py:11-20` | 「常に exit 0」に例外がある | P3-13 |
| `session_start.py:77`（docstring） | 「非対話起動では何もしない」だが、実装は `sdk-` 始まりだけを除く | P3-13 |
| `spec/server.md:17`・`entry.sh:66-69` | 同期忘れを検出すると書くが、検出するのは複製の直接編集だけ | P2-15 |
| `spec/server.md:32-33` | 「リクエスト全体は失敗させない」に深い入れ子が反する | P2-12 |
| `spec/system.md:96` | NULL 率を「特定列」と書くが実装は 4 列 | P2-15 |
| `spec/system.md:94-95`・`spec/server.md:63-64` | 途絶えと急落で停止に気づけるように読める | P2-15 |
| `decisions/server.md:31`（判断 15）・`spec/server.md:61-64` | 準拠率が CSV を前提にし、CSV は任意の方針と衝突する | P2-10 |
| `decisions/server.md:86` | 「数秒級になりうる（推測）」 | UC 76 の実測を `measurements.md` に置いて参照する |
| `knowledge/upstream-features.md:90-92` | PermissionRequest の「発火条件は未確認」 | 7 章の事実で更新 |
| `knowledge/db-and-framework-facts.md:31` | 「行フォーマットは未検証」 | MySQL 8.4 の既定で索引を作れたと足す |
| `knowledge/measurements.md:91` | 187〜201 ms に `python3` の解決方法が無い | 7 章の値を条件つきで足す |
| `e2e.md:141`・`knowledge/claude-code-behavior.md:36` | `permission_mode` の default 以外は対話でしか出ない | `--permission-mode` で変わると補う |
| `e2e.md:179-180`・`e2e.md:91` | `CC_E2E_RUN` が無く、判定が SET だけを前提にすることが無い | P3-11 |
| `uc-77-burst-ingest/notes.md` | 「hook は 0.5 秒」 | シムを含む値と注記する |

## 7. `docs/knowledge/` に足す外界の事実

特記の無いものは `claude` 2.1.283・macOS での観測である。

| 書く先 | 事実 | 版・条件 | UC |
| --- | --- | --- | --- |
| `claude-code-behavior.md` | 本体は、JSON として壊れた・トップが配列か null・空・スキーマ違反・2 MiB 超の settings.json をファイルごと黙って無視し、`enabledPlugins` も効かない。`-p` には何も出ず `claude doctor` の `Invalid settings` だけに出る。BOM 付き・Latin-1 は読む。無視したファイルは書き換えない | 2.1.283 | 01・13 |
| 同上 | schemastore のスキーマと本体の検証はずれうる（env の int を本体は受け付け、schemastore は拒む） | 2.1.283・fixture 2026-09-25 | 01 |
| 同上 | `-p` が `CLAUDE_CODE_ENTRYPOINT` を `sdk-cli` に書き換えるのは `cli` と空のときだけ。`sdk-*`・`claude-vscode`・未知の値はそのまま hook に届く | 2.1.283 | 24 |
| 同上 | hook の `timeout` 超過は `outcome: cancelled`・`exit_code 1`。処理が最後まで走り副作用が残ることがある。stream-json に出るのは SessionStart の hook の結果だけ。同じ config で一斉に 20 本以上起動するとほぼ全部が打ち切られた | 2.1.283・8 コア | 14・77 |
| 同上 | `plugin update` は版だけで判定し、引き下げも受け付ける。版を上げない再 publish は「already at the latest version」。uninstall は `enabledPlugins` の項目と data を消し、`--keep-data` で残せる。`marketplace remove` は `extraKnownMarketplaces.<mp>` を丸ごと消す | 2.1.283 | 06・55・60 |
| 同上 | hook の `python3` は利用者の PATH で解決され、pyenv のシムだと 1 回約 0.4 s。未ログインの `-p` では Stop は動かない | 2.1.283 | 43 |
| `upstream-features.md` | `PermissionRequest` は `-p` の既定モードで許可リスト外のツールに発火する。`PermissionDenied` は既定モードの拒否と deny ルールの拒否では発火しない（各 1〜2 回。分類器の拒否は未確認） | 2.1.283 | 31 |
| 同上 | `command_source` の観測値は `userSettings` と `plugin`。同梱物は `governance:名前`。`/compact` は UserPromptExpansion を経ない。context_tokens は PreCompact・Stop だけ | 2.1.283 | 35・36 |
| 同上 | Agent を使ったターンの順序: Agent が先に戻る → 親の Stop → 子のツール（呼び出したターンの prompt_id、agent_id 付き）→ 親の新しいターン（UPS と Stop）。Agent 自体の PostToolUse に agent_id は無い（解釈は推定） | 2.1.283・`-p` | 36 |
| `db-and-framework-facts.md` | MySQL 8.4 と pymysql 1.2.3 の `executemany` は utf8mb3・latin1 の表で `DataError 1366` になり全行が入らない。MySQL 8.4 の既定（DYNAMIC・utf8mb4）で契約の全索引を作れる | MySQL 8.4・pymysql 1.2.3 | 39 |
| 同上 | `json.loads(bytes)` の性質（surrogatepass・BOM・4300 桁・深い入れ子で `RecursionError`）。Jinja は制御文字を逃がさない。`sqlite3` の busy timeout は既定 5 秒。waitress の既定は 4 スレッド・`connection_limit` 100。SQLite の型アフィニティ（数字文字列を整数にし、VARCHAR の列では text で比較する）。`python:3.9-slim` の SQLite は 3.46.1。`sh` を PID 1 にすると `docker stop` が SIGKILL で終わる | Python 3.9・waitress（版は notes） | 32・39・46・76・77 |
| 同上 | urllib はプロキシ変数に従う。名前解決・トンネル・本文を読まない 413 の切断は `URLError` になる | Python 3.9 | 47・50 |
| `measurements.md` | hook の所要: 実体の python 66 ms、シム 465 ms、load 36〜47 で最大 5.95 s、20 MB の transcript でも Stop は不変 | macOS・8 コア | 43 |
| 同上 | 1 年分・200 名（313 万行）で 4 画面 0.1〜1.8 s、error 行 70 万行で概況 6.9 s。140 同時の受信で p95 2〜3.5 s・5xx 0 | Colima 2 CPU/3 GiB・並行負荷あり | 76・77 |
| 同上 | AI Gateway の CSV は月で `Date` の書式が変わり（`YYYY-MM-DD` と `YYYY/M/D`）、`Cost` に指数表記（`e-`・`E-`）がある。1 ファイルに Provider 2 種を含む | 2026 年 7・8 月分 | 68 |

## 8. 検証の方法への所見

### 効いたこと

- **判定を壊して確かめる規律**: 全 UC が自己検査・変異・陽性対照のいずれかで判定が落ちることを確かめ（抜き取りで確認）、期待の誤りも見つけた（UC 01 の R3、UC 12 の run1、UC 39 の 2 ケース、UC 41 の A5）
- **未ログインの `-p`**: SessionStart は未ログインでも発火するので、設定と送信の大半を API 費用なしで回せた（見込み 10〜40 USD に対し約 2〜3 USD。一部は見積もり）
- **`CC_E2E_RUN` によるラベルの分離と worktree**: 並行の実行が互いを止めず、3 トラックのブランチは衝突なく統合できた
- **`heavy.lock`**: 重い段（UC 13・14・38・68・76・77）を直列にでき、全員が `trap` で返した
- **領域ごとの精査とレビュー**: 報告書の誤り（既存テストの見落とし・「重複 0」・送るものの誇張・UC 36 の解釈）と、最重要の発見（送信先の手順の食い違いと本番への誤送信）は、この段で見つかった。1 回の報告書づくりでは取りこぼす

### 効かなかったこと

- **並行の負荷で数字が揺れた**: `heavy.lock` は重い段の重なりしか防がず、load average は 5〜47 を動いた。画面の中央値が同じ実行計画のまま 2 倍揺れ（UC 76）、hook の計測に高負荷の区間が混ざり（UC 43）、偽の赤が出た（UC 06・12・50）
- **ラベルの粒度**: `CC_E2E_RUN` はトラック単位では足りず、トラック B は UC 39 以降 UC 単位にした。`E2ERoot` の接頭辞は変えられず、ラベルの無い `cc-e2e-*` を各トラックが「自分のものではない」として残した
- **自己申告と実物の食い違い**: UC 76 の notes は DB を「すべて削除」と書いたが、1.5 GB の `s100.db` が残っていた。「確認済み」の主張にも、実際は前段までしか確かめていないものがあった（UC 77 の判定の実装）
- **一時文書の誤り**: `strategy.md:40` の変数名（`CC_E2E_LABEL`）、`progress.md:29` の 401・404 の扱い（逆）、UC 38 の notes の「flush 後を走査しない」は誤りだった
- **作業上の罠**: `pgrep -f "pytest e2e"` が自分のシェルに一致し、待機が止まらなかった（UC 50）

### 次回への提案

- 計測の UC（43・76・77）は、ほかのトラックを止めた専用の時間帯に行う。`heavy.lock` の意味を「計測中は他が claude と Docker を起動しない」に広げる
- `CC_E2E_RUN` は `<トラック>-<UC>` を規約にし、`E2ERoot` の接頭辞もそこから作る（P3-10）
- 最後の棚卸しは監督が実物で行う（`git worktree list`・`ls $TMPDIR`・`docker system df`・`du .local/`）。共有の資源は監督が判断する
- 報告書の初稿の後に、領域ごとの静的な精査とレビューを必ず挟む。「確認済み」は何をどこまで確かめたかを添えて書かせる
- 複数のトラックが書き直した部品（`Box`/harness、送信の生バイトの受け口、`DockerServer.sql()`）を `e2e/` に取り込むかを決める

## 9. 片付けの状況

「確認」は監督が実物を見たもの（2026-09-27 時点）、「自己申告」は track-*.md と notes.md の記述である。

| 対象 | 状態 | 出どころ | 残す理由・消し方 |
| --- | --- | --- | --- |
| worktree `wt-a`・`wt-b`・`wt-c` | 取り外した（`.venv` と `server/` の複製も消えた）。取り外す前に `git status` で確かめたので、worktree 内の無視されたファイルは見ていない。スクリプトの出力先はすべて本体の `.local/` で、失ったものは無いと推定する | 確認・推定 | — |
| ブランチ `e2e-load-testing-a`・`-b`・`-c` | 手元と origin に残る。統合済み | 確認 | `git branch -D` と `git push origin --delete` |
| ハンドオフ文書 `bmsd-governance/work/e2e-load-testing/` | 残る（数 KB）。`product/` の外 | 確認 | 消しても成果物に影響しない |
| `heavy.lock` | 残存なし | 確認・自己申告 | — |
| `$TMPDIR/cc-e2e-*` | 0 件 | 確認 | — |
| Docker のコンテナ | 0 件 | 確認 | — |
| Docker のイメージ | `server-server:latest`（228 MB、今回より前）と `python:3.9-slim` が残る。`mysql:8.4` は消した | 確認・自己申告 | — |
| Docker のビルドキャッシュ | 約 1.2 GB（解放できる分は 0.99 GB） | 確認 | `docker builder prune`。ほかのプロジェクトのキャッシュも消えるので利用者の判断 |
| Colima のデータディスク | `colima ssh -- sudo fstrim -a` でホストの空きが 5.3 GiB から 8.5 GiB に戻った | 確認 | — |
| `.local/e2e-load-testing/` | UC 76 の `s100.db`（1.5 GB）は承認を得て消した。残りは約 21 MB（測定用 venv・生の記録・ユースケース集） | 確認 | PR を見終えてから消す |
| `.local/` の機微なもの | UC 68 の実 CSV の複製は削除済み。UC 39 の MySQL のログはパスワードを伏せた。UC 35・36 の `queue-raw.jsonl` は識別子を、UC 24・60 の JSON は一時パスとポートを含みうる。API キーの混入は無いと各トラックが申告（全ファイルの走査は未確認） | 自己申告 | 上と同じ |
| `e2e/__pycache__/` | 残る（gitignore の対象） | 自己申告 | — |
| 本物の `~/.claude` | 痕跡なし。`~/.claude/cc-governance/identity.json`（9/26 付）は今回より前からあり、触っていない | 自己申告 | — |
| コード | 変更は準備の `e2e/_server.py`（`CC_E2E_RUN`、0750fa0）だけ。`plugin/`・`server/`・`e2e/`・`plugin/config.json` は元へ戻した。UC 32 の差分は `uc-32-add-column/*.diff` にだけある | 自己申告 | — |
| 起動したプロセス | テスト由来（`claude -p`・waitress・pytest・送信）は 0 件 | 確認 | — |
| ホストのディスク | 22:40 時点で空き 9.8 GiB（検証前は約 19 GiB、利用者の記憶）。差の主因はスワップ（7.4 GB）と推定。ほかに `$TMPDIR/pytest-of-*`（750 MB、3 世代で自動的に入れ替わる）とビルドキャッシュ | 確認・推定 | スワップは並行セッションを閉じるか再起動で戻る |

## 10. 検証しなかったこと・未確認のこと

### 対象外にしたもの

- この環境では不可能なもの: Windows、Bedrock、AIP へのデプロイ、社内のプロキシ・証明書、配布リポジトリの staging と自動更新の実配信、IDE 拡張
- 対話でしか見えない表示（ステータスライン・エラー表示・既読）は手動確認に回した
- 本番のデータが要る調査、集計ロジック・効果測定・MySQL の網羅（`server/tests` の領分）、旧版の Claude Code での回帰
- 性能の数字は Colima（2 CPU・3 GiB）で並行の負荷の中で測った。本番（AIP・Python 3.9・MySQL の可能性）を表さない

### 精査で残った未確認

| 事項 | 状態 |
| --- | --- |
| staging の行（開発者本人）を本番 DB に入れてよいか | 要確認（P1-5） |
| `validate_plugin.py` と `pytest tests` の POST が実際に届くか | 経路はコードで確認。到達は未実測（P1-2・P1-3 の確認で確かめる） |
| `hooks.json` の `timeout` の変更が、長く続くプロセスにいつ効くか | 次に起動したプロセスからと推定。resume・clear・compact での適用も未確認 |
| schemastore が通して本体が捨てる値の実在 | 未確認 |
| 打ち切りの原因（シムか CPU の奪い合いか）と、打ち切られた位置 | 未切り分け（推定） |
| 5xx の毒ファイルで後続が止まること | コードからの推定（UC 39） |
| CSV 無しの経路を E2E が通るか | `test_server` の画面のテストが取込の前に流れる順序に頼っているかは未確認 |
| `_quiet` の静止時間（`_QUIET_SEC`）の前提による偽の赤 | 推定 |
| 精査全体 | 静的な確認だけで、コード・テスト・`claude` は実行していない |

### UC ごとの中断・未確認

| UC | 確かめていないこと |
| --- | --- |
| 01 | int の 60 のままで設定が効くか。古いバックアップを戻して直るか |
| 06 | `_BACKUP_KEEP` の世代数を超えたバックアップの押し出し（推定）。自動更新の経路での版の引き下げ。ONCE での偽の赤 |
| 13・60・24 | 対話起動での表示。本物の Agent SDK と VS Code 拡張。新しい版への再導入 |
| 14 | 認証ありと対話での同時起動 |
| 31 | 分類器の拒否で `PermissionDenied` が発火するか（再現できず中断） |
| 32 | AIP で起動に失敗した Function の見え方。`collect.py SessionStart` で行が増えない理由（起動口の取り違えと推定） |
| 35 | プロジェクトと managed の `command_source` |
| 36 | Agent がバックグラウンドで実行されたか（推定。観測は 1 回）。対話でも同じ順序か |
| 39・47 | waitress の既定の本文上限。AIP の前段の本文上限と 413 の振る舞い |
| 43 | セッション中の hook 1 回の増分が単体の約 2 倍になる原因。会社 PC での値 |
| 46 | spool が上限に達するまでの約 30 時間（今の設定値での外挿）。`rotate` の間の追記の喪失（推定） |
| 50 | DNS の問い合わせが上流まで出たか。会社 PC の `NO_PROXY` の要否 |
| 55 | 起動時の自動更新が起きなかった原因。最初の試行で `sent_at` ができなかった原因 |
| 68 | MySQL での `NaN` の cost。AIP の前段のタイムアウト（50 万行の取込で 93 s） |
| 76 | `errors` に索引を足した効果。「5 倍を 1 年分」（直近 35 日だけ 5 倍で代えた）。MySQL での 5 列の索引の効果 |
| 77 | 大きな DB で ANALYZE が SQLite の busy timeout（既定値）を超えるか。20 並列の 1 回目で送信が起きなかった 8 セッションの原因 |
| 38 | API 費用の実額（推定のみ） |
