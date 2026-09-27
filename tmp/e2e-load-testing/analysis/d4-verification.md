# D4 集計サーバ（受信・取込・画面・DB）の精査

## 1. 結論（5 行以内）
- 担当 6 UC（32・39・55 受信側・68・76・77 受信側）の事実は、コードと突き合わせてほぼすべて裏付けが取れた。notes の観測に誤りは見つからなかった。
- 報告書の誤りは 4 つある。(a) UC55 の「止まるのは `-k collect` だけ」は誤りで、契約の列を固定したテストでも落ちる。(b) MySQL の文字コードを P1 に数えているが、本番は SQLite と決まっている。(c) 修正先のファイル名が 2 か所違う。(d)「端末から最後に届いた時刻が無い」は一部誤りで、`/policy` の途絶え表示がある。
- 最大の取りこぼしは、CSV の日単位の置き換えが効果測定と準拠率の分母を無言で歪めることである。欠けた日のコストが 0 として足される。ただしファイル同士の日の重なりはテストが前提とする正常な運用なので、「重なったら止める」案は採れない。
- ほかに、コードから推定した無言の経路が 2 つある。ANALYZE がコミットの後に失敗すると、保存済みなのに 500 を返す。大きな CSV の取込中は `/ingest` が 500 になりうる。
- リリース前（P1）に入れるべきサーバ側の変更は、CSV の「置き換えで行が減った日」の警告と、全行破棄を失敗の枠で出すことの 2 件に絞れる。

## 2. 発見の検証
| 発見 | UC | 判定 | 根拠（ファイル:行） | 報告書の要修正点 |
| --- | --- | --- | --- | --- |
| `entry.sh` の照合は同期忘れを通す | 32 | 裏付けあり | `server/entry.sh:44-71`（複製とハッシュ記録の組だけを比べる） | なし。ただし `entry.sh:68` のエラー文言も「同期していない」と誤っている（5 章） |
| ALTER を忘れると起動が止まる | 32 | 裏付けあり | `server/ccgov/store/db.py:124-136`・`:150-158` | なし |
| 型を誤った ALTER でも起動する | 32 | 裏付けあり | `db.py:104-110`（列名だけを取る） | なし |
| 端末だけ新しい期間の値は戻らない | 32 | 裏付けあり | `server/ccgov/ingestion/ndjson.py:34-43`（契約の列だけを読む） | なし |
| 10 万段の入れ子でリクエスト全体が 500 になる | 39 | 裏付けあり | `ndjson.py:48-51`（`ValueError` だけを捕まえる） | なし |
| MySQL が utf8mb4 以外だとバッチ全体が 500 になる | 39 | 一部誤り（優先度と修正先） | DDL は `contract.py:193-195` が方言によらずに作り、CHARSET を持たない。保存は 1 トランザクション（`ndjson.py:113-120`）。本番は SQLite（`docs/guide/deploy-aip.md:8`） | 4.1 は P1 に数えている（1 章の「P1 の 7 件」に含まれる）。P3（MySQL を選ぶときの前提条件）に下げる。修正先は `db.init` で、MySQL のときだけ CHARSET を足す（`contract.ddl` は共有の正本で方言によらない） |
| `event_id` が NULL の行と `ts=1` の行が検査を通る | 39 | 裏付けあり | `ndjson.py:57-61`（真偽の判定が coerce の前）、`contract.py:125-126`（bool を int にする） | なし |
| 5xx のファイルは最大 7 日届かない | 39 | 裏付けあり（コード） | `plugin/hooks/_sender.py:68-70`・`:80-85`（2xx 以外は消さず、次のファイルへ進む） | D3 の範囲 |
| `ts` を改名した版は event 行が全損し、サーバは 200 を返す | 55 | 一部誤り・誇張 | 挙動は `ndjson.py:59-61`・`:123` のとおり。ただしこの改名・列の削除は `tests/plugin/test_contract_constants.py:16-39`（列の並びを固定）で落ちる。さらにサーバは `kind`・`event_id`・`ts` を名指しで読む（`ndjson.py:54-59`）ので、サーバを同期しても `ts` の改名は通らない。そもそも契約として取れない変更である | 3.2 の「今の検査で止まるのは `-k collect` だけ」を「`pytest tests` と `-k collect`」に直す。重大度「高」の根拠は、版の上げ忘れ（D1）の側に寄せる |
| 概況の NULL 率は 4 列だけを見る | 55・31 | 裏付けあり | `server/ccgov/store/queries_events.py:9-15` | なし（`system.md:96` と食い違う。5 章） |
| 版の分布が user_email の NULL で 1 台に潰れる | 55 | 裏付けあり | `queries_policy.py:103-116`（`PARTITION BY user_email, host`） | 報告書に無い（3 章） |
| 同じ日を含む別ファイルがその日を丸ごと置き換える | 68 | 裏付けあり（仕様どおり） | `csv_import.py:94-112`、`docs/spec/server.md:41`（冪等キーは `day`） | 「仕様どおりで、警告が無いことが問題」と書く。重なり自体は正常な運用（3 章）なので、4.1 の「止める」は選択肢から外す |
| 同名の `Cost` 列・`$` 付き・`123.0` 形の値が成功表示のまま NULL か 0 になる | 68 | 裏付けあり | `csv_import.py:26`（後ろの列で上書き）、`contract.py:130-133`・`:147-151` | なし |
| 全行を破棄したファイルが緑の枠で出る | 68 | 裏付けあり | `server/ccgov/web/templates/overview.html:66-69` | なし |
| 空の `User Email` を `""` の 1 人と数える | 68 | 裏付けあり | `csv_import.py:58-61` | 影響の書き方が不足（3 章） |
| 拡張子 `.CSV` を無視する | 68 | 裏付けあり | `csv_import.py:123` | なし |
| `/ingest` は user_email を小文字にそろえない | 68 | 裏付けあり | `ndjson.py:34-43`。端末は小文字にして送る（`plugin/hooks/_identity.py:68`・`:78`） | 影響は旧版の端末と直接の送信に限られる、と添える |
| `errors` に索引が無く、`_TABLES`（ANALYZE の対象）から外れている | 76 | 一部誤り（軽微） | `db.py:18-30`。SQLite の `ANALYZE` は全表が対象（`db.py:141-143`）。`_TABLES` が効くのは MySQL の `ANALYZE TABLE` と索引の作成だけ | 3.7 の括弧書きを「MySQL の ANALYZE TABLE と索引の作成の対象」に直す |
| error 行 70 万行で概況が 6.9 s になる | 76 | 実測（notes） | `error_summary` は `store/queries_errors.py:7-29`（窓関数 2 本） | 4.1 の P2 は修正先を `db.py` と書いている。`error_summary` の書き換えは `queries_errors.py` の変更である |
| `/effect` は 5 列の索引が無いと 120 s を超える | 76 | 裏付けあり（前提の説明が不足） | `db.py:25-26`。索引は起動のたびに `db.init` が作る（`db.py:158`） | 起きるのは索引を作れない場合だけ、と添える（3 章） |
| busy timeout は既定の 5 秒で、超えると 500 になる | 77 | 裏付けあり | `db.py:65-67`（`sqlite3.connect(path)` に timeout の指定なし） | なし |
| 140 同時でも 5xx は 0、waitress は既定の 4 スレッド | 77 | 裏付けあり | `entry.sh:75`（`--threads` の指定なし・`exec` なし） | なし |
| サーバに「端末から最後に届いた時刻」が無い（3.3） | 47・50・60 | 一部誤り | `/policy` の `stale_terminals`（`queries_policy.py:89-99`、`STALE_DAYS=14`）が、policy 行の途絶えを出す | 「policy 行は届き、events だけが止まる場合（収集だけの失敗・`ts` の欠落）は画面に出ない」と限定する |

## 3. 取りこぼし
- **CSV の置き換えの波及（重大）**: 欠けた `(利用者, 日)` のコストは、イベントスタディで 0 として足される（`queries_policy.py:164`）。このため効果測定のコストが無言で過小になる。準拠率の分母（`:37-58`）と未導入者（`:72-85`）も変わる。現実に起きる条件は、Provider や Workspace ごとに分けて出力した CSV である。実 CSV は 1 ファイルに Provider 2 種を含み、`Workspace ID` 列も持つ（UC68）。
- **日の重なりは設計上の正常な運用**: テストの見本は、日次のファイルと週次のファイルが同じ日を含む形を前提にしている（`server/tests/test_ingestion_csv_scan.py:55-73`、`fixtures/daily_a.csv`・`weekly.csv`）。検出すべきは重なりそのものではなく「置き換えで行（または利用者）が減った日」である。
- **ANALYZE の失敗が保存済みの行を 500 にする（推定・コードから）**: `ingest` はコミットの後に `_analyze_if_due` を呼ぶ（`ndjson.py:117-122`）。ANALYZE がロックで落ちると、行は保存済みなのに 500 を返す。その結果、端末の再送で重複が起き（件数は `COUNT(DISTINCT event_id)` で吸収される）、誤った `HTTP 500` の error 行が積まれる。`_last_analyzed_at` は実行前に更新されるので（`:102`）、統計は 1 時間古いままになる。なお ANALYZE は再起動の後だけでなく、1 時間ごとの最初の受信でも走る（`:97-103`）。
- **大きな CSV の取込中は `/ingest` が 500 になりうる（推定）**: ファイルごとの DELETE と INSERT、最後の ANALYZE が書き込みロックを握る（`csv_import.py:94-112`・`:139`）。50 万行で 93 s かかる（UC68）。busy timeout の 5 秒を超える。実データの規模（月 3 千行）なら問題にならない見込み。
- **空の email の影響**: `""` は `/policy` の分母に入って未準拠に数えられ、未導入者の一覧にも空の行として出る（`queries_policy.py:37-58`・`:72-85`）。
- **既知の課題との重複**: UC68 の「MySQL で NaN の cost を入れると取込全体が 500 になるかもしれない」は、`docs/remaining/known-issues.md:26-31`（CSV 取込での DB 例外の扱い）に含まれる。CSV の順序の検出不足も `known-issues.md:12-13` にある。新しい発見として扱わない。
- **UC76 の「MySQL で 5 列の索引が作れないかもしれない」は、ほぼ解消している**: 宣言長から計算すると、最大の複合索引でも約 2.5 KB で、DYNAMIC の上限 3,072 バイトに収まる。UC39 の MySQL 8.4（既定の行フォーマット）でも `db.init` が通り、200 を返した。作れないのは COMPACT・REDUNDANT（767 バイト）の場合だけである（推論。索引の作成を直接は確かめていない）。
- **UC32 の未確認「`collect.py SessionStart` で行が増えない」**: SessionStart は `session_start.py` に配線されている（`plugin/hooks/hooks.json:71-77`）。起動口の取り違えの可能性が高い（D2 で確かめる）。
- **消した CSV の行は DB に残る**（UC68 (2)）。報告書に無い。誤ったファイルを取り込んだときの戻し方（SQL）が運用文書に無い。
- **errors の嵐の規模は D3 の修正に左右される**: 70 万行／7 日という規模は、UC46 の二乗の増え方が無いと届きにくい（推定）。送信側を直せば `error_summary` の緊急度は下がる。

## 4. 改善案
| ID | 観点 | 内容 | 優先度 | 根拠 |
| --- | --- | --- | --- | --- |
| D4-01 | バグ修正 | CSV の取込で、ファイルごとに `DELETE` の件数と、その日に入れた行数・利用者数を比べる。減った日があれば、ファイル名と日数を画面に警告する（重なっただけでは止めない）。`test_ingestion_csv_scan.py` に「一部だけの訂正版で警告が出る」テストを足し、検出を外すと落ちることを確かめる | P1 | UC68、`csv_import.py:94-112`、`queries_policy.py:164` |
| D4-02 | バグ修正 | `rows == 0 and dropped > 0` の結果を `err` の枠で出す | P1 | UC68、`overview.html:66-69` |
| D4-03 | 運用・文書 | `deploy-aip.md` に CSV の運用規則を書く。1 ファイルはその日の全行（全 Provider・全 Workspace）を含むこと、ファイル名は日付順にすること、消したファイルの行は DB に残ること（戻す SQL を添える） | P2 | UC68、`deploy-aip.md:28`・`:95` |
| D4-04 | バグ修正 | 元のセルが空でないのに `coerce` が NULL にした件数を列ごとに結果へ出す。必須列の名前が重複したら `ValueError` にする | P2 | UC68、`csv_import.py:26`・`:58` |
| D4-05 | バグ修正 | `parse_line` で `RecursionError` も破棄に数える。`event_id` の検査を coerce の後に移し、`ts` の bool を拒否する。bool の拒否は `ndjson` 側で行い、共有の `contract.coerce` は変えない | P2 | UC39、`ndjson.py:48-61`、`contract.py:125-126` |
| D4-06 | 観測 | 破棄した行の件数を、理由ごと（JSON 不正・kind・event_id・ts）にログへ出す（値は出さない）。`dropped` を誰も見ていない | P2 | UC39・55・32、`ndjson.py:71-81` |
| D4-07 | バグ修正・性能 | `db.connect()` の SQLite に `timeout` を明示する（端末の上限 60 秒より短い 30 秒程度）。`server/tests` に、別の接続がロックを 6 秒握る間の受信が 200 になるテストを置き、timeout を戻すと落ちることを確かめる | P2 | UC77、`db.py:65-67` |
| D4-08 | 性能 | `error_summary` を、先に `GROUP BY` で数え、最新の版と端末数を別の小さいクエリで取る形に書き換える。索引は嵐の中では読む行が減らない見込みなので従とする。足すなら `_TABLES` にも `errors` を加える（`db.py:95-98` の辞書の参照が KeyError になるため）。D3 の送信の修正が入れば緊急度は下がる | P2 | UC76、`queries_errors.py:12-28`、`db.py:18` |
| D4-09 | 文書 | `release.md` の 11 に次を足す。型は契約と同じにすること、ALTER の実行手段（イメージに `sqlite3` CLI は無い）と `PRAGMA table_info` での確認、端末を先に配るとその間の値は戻らないこと、列の並びを固定したテスト 2 件を直すこと。あわせて 6 の同期の項目に `contract.py` を足す | P2 | UC32、`release.md:48`・`:137` |
| D4-10 | 画面・仕様 | NULL 率の対象を契約の全列に広げるか、分布の表に NULL の行を出す。どちらもしないなら、`system.md:96` の主張を 4 列に限る | P2 | UC55・31、`queries_events.py:9-15` |
| D4-11 | バグ修正 | ANALYZE の失敗を受信の失敗にしない（ログに出して 200 を返す）。または受信の外へ出す | P3 | 推定、`ndjson.py:93-103`・`:117-122` |
| D4-12 | 起動時の検査 | `_check_contract_columns` で宣言型も照合する（MySQL の型表記の正規化が要る） | P3 | UC32、`db.py:104-136` |
| D4-13 | 設計（MySQL を選ぶとき） | `db.init` で、MySQL のときだけ CREATE TABLE に `DEFAULT CHARSET=utf8mb4` を付ける。起動時に `information_schema` で文字コードを検査する。MySQL を採る判断の前提条件として `deploy-aip.md` に書く | P3 | UC39、`contract.py:193-195`、`deploy-aip.md:8` |
| D4-14 | 仕様・文書 | 版の分布は `(user_email, host)` ごとの最新 1 行で数え、user_email が NULL の端末は host ごとに 1 台へ潰れる。これを仕様に書く | P3 | UC55、`queries_policy.py:103-116` |
| D4-15 | バグ修正 | 取込の細部をまとめて直す。空の `User Email` を NULL にする（`/policy` の水増しを防ぐ）、拡張子の大文字小文字を問わない、末尾の空行を破棄に数えない（`ndjson` の空行の扱いにそろえる）、`/ingest` でも user_email を小文字にそろえる | P3 | UC68、`csv_import.py:58-61`・`:85-90`・`:123` |
| D4-16 | テスト | `server/tests` に実行計画の回帰テストを置く。`/effect` のコンテキスト分布が 5 列の索引を使うことを EXPLAIN で確かめ、索引の定義を消すと落ちることも確かめる | P3 | UC76、`db.py:25-26` |
| D4-17 | 防御 | `MAX_CONTENT_LENGTH` を設ける（端末の spool の上限 5 MB を根拠に 16 MB など） | P3 | UC39、`server/ccgov/web/__init__.py:15-19` |
| D4-18 | 知識 | `db-and-framework-facts.md` に足す。MySQL 8.4 の既定で契約の索引はすべて作れた（UC39 からの間接の事実）。SQLite の VARCHAR の列は数字を text で比較する。INTEGER の列は数字文字列を黙って整数にする | P3 | UC32・39・76、`db-and-framework-facts.md:20-31` |

## 5. 現在の文書・実装との不整合
| 箇所 | 内容 | 直し方 |
| --- | --- | --- |
| `docs/spec/server.md:17` | 「複製の直接編集と同期忘れを検出する」とあるが、同期忘れは検出しない | 検出するのは複製の直接編集だけで、同期忘れは `sync_contract.py --check` とテストが捕まえる、に直す |
| `server/entry.sh:68` | エラー文言が「複製が正本と同期していない」と言う（正本は照合していない） | 「複製がハッシュ記録と一致しない（直接編集の疑い）」にする |
| `docs/spec/server.md:32-33` | 「リクエスト全体は失敗させない」とあるが、深い入れ子（`ndjson.py:48-51`）と MySQL の文字コード違反では全体が 500 になる | D4-05 で実装を直す。MySQL の分は限界として書く |
| `docs/guide/release.md:137` | 「順序を誤るとサーバが起動しない」は ALTER 忘れにしか当たらない | 型の誤り・同期忘れ・端末を先に配った場合は起動したまま無言でずれる、と書く |
| `docs/guide/release.md:48` | 同期の確認項目が `policy.py` だけ | `contract.py` を足す |
| `docs/spec/system.md:96` | 「特定列の NULL 率が 100% に跳ねる」とあるが、実装が見るのは 4 列だけ（`queries_events.py:9-14`） | D4-10 で実装か文書をそろえる |
| `docs/spec/system.md:92` | CSV の変化の表が「列が増える」だけで、同名の列や値の形の変化で無言になることが無い | 行を足す |
| `docs/decisions/server.md:86` | 「数秒級になりうる（推測。未測定）」 | `measurements.md` に UC76 の実測を条件つきで置き、そこを参照する |
| `docs/decisions/server.md:36`（判断 16） | 「行の不正は 200」の前提が、MySQL の文字コード違反では崩れる（1 行の不正が保存の失敗として 5xx になる） | D4-13 と合わせ、MySQL を選ぶときの条件として書く |
| `docs/knowledge/db-and-framework-facts.md:31` | 「行フォーマットは未検証」 | MySQL 8.4 の既定では契約の索引を作れた（UC39）、と足す |
| 報告書 4.1 の修正先 | `error_summary` を `db.py` の修正として書いている。CHARSET を `db.py` の CREATE TABLE に付けると書いている | `queries_errors.py` と `db.init`（方言分岐）に直す |

## 6. 他領域へ・未確認のこと
- **D3 へ**: 5xx の毒ファイル（UC39）と、error 行の二乗の増え方（UC46）。後者は D4-08 の緊急度を決める。サーバ側の「届いた時刻」の限界（2 章の最終行）も D3 の 3.3 の記述に関わる。
- **D1・D3 へ**: SessionStart の打ち切り（UC77）は `session_start.py` の順序の問題で、サーバでは対処しない。
- **D1 へ**: 版の上げ忘れ（UC55）。報告書の 3.2 は重大度「高」の根拠をここに置くべきである。
- **D2 へ**: UC32 の `collect.py SessionStart` は起動口の取り違えと推定する（`hooks.json:71-77`）。NULL 率が 4 列だけの問題は UC31 と共通。
- **D5 へ**: `e2e.md:205` は既に「DB は SQLite だけ」と書いているので、報告書 4.3 の P2 は文字コードの具体に絞る。`DockerServer.sql()`・8 月の書式の見本行・取込の再取り込みのテストは D5 の範囲。
- **未確認**: waitress の本文の上限の既定（1 GiB と理解しているが確かめていない）。大きな DB で ANALYZE が 5 秒を超えるか。UC76 の再起動後の初回 3.34 s のうち ANALYZE の分と冷えたキャッシュの分の内訳。`errors` に索引を足した効果。AIP の前段の取込タイムアウト。D4-01 の「減った日」の検出が、実運用の週次と日次の取り直しで誤警報を出さないか（完全な日同士なら行数は同じはず、というのが前提。`measurements.md:107` の「出てきた日の値は確定している」に依拠する）。
- 本精査はすべて静的な確認である。コード・テスト・`claude` は実行していない。
