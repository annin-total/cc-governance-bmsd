# UC32 収集項目（列）の追加（No.32・No.71・No.72）

## 目的

文書（`docs/guide/release.md` の「11. 列や行の種類を足したとき」、`docs/spec/server.md` の「契約の複製」「契約と実テーブルの突き合わせ」）の手順どおりに収集項目を 1 つ足し、
端末の実際の hook 入力から既存 DB の新しい列まで値が届くことを確かめる。あわせて、順序を誤ったときに**明示的に止まるか・無言で壊れるか・どこに何が出るか**を 1 つずつ記録する。

足す列: `("duration_ms", ("duration_ms",), "INTEGER")`（`PostToolUse` / `PostToolUseFailure` の実在キー。ツールの所要ミリ秒で、本文ではない）

## 仮説（実装を読んで立てたもの）

- (a) 同期忘れ（No.71）: `sync_contract.py --check` と `tests/integration/test_contract_sync.py` は落ちる。**`entry.sh` の照合は複製とハッシュの組しか見ないので通り、サーバは起動する。**`docs/spec/server.md` の「同期忘れをここで検出する」は誤り
- (b) ALTER 忘れ（No.72）: 新サーバは `db.init()` の `RuntimeError`（欠けた列名つき）で起動を中止する。出るのはコンテナのログだけ
- (c) サーバだけ新しい: 旧端末の行は保存され、新しい列は無言で NULL
- (d) 端末だけ新しい: 旧サーバは契約外のキーを無言で捨て、200 と `stored` を返す。(a) の実行時の姿はこれと同じ
- (e) 型を誤った ALTER: 起動時の検査は列名しか見ないので起動する。SQLite は宣言型の親和性で値を変換し、無言で型が変わる

## 手順

作業コピー（`$TMPDIR/cc-e2e-b-uc32-work`。wt-b から `.venv`・`.git`・`tmp/`・`.local` を除いて rsync）の上で行った。wt-b の `plugin/`・`server/`・`scripts/` は書き換えていない。

1. 旧版を `plugin.old/`・`server.old/` に控える
2. `plugin/hooks/contract.py` の `HOOK_FIELDS` に 1 行足す（`contract.diff`）
3. **(a) 同期する前に**、`sync_contract.py --check`・`entry.sh` の照合部（heredoc を抜き出して `server/` で実行）・`pytest tests` を流す
4. `sync_contract.py` を実行（`server.diff`）。列の並びを固定している 2 つのテストに列を足す（`tests.diff`）。`pytest tests` を再実行
5. `run.py`（Docker。`CC_E2E_RUN=b-uc32`）:
   - 0: 旧サーバ（`server.old` のイメージ）+ 旧端末で既存 DB を作り、サーバを止めて DB を取り出す（`d0`）
   - (b) `d0` のまま新サーバを起動
   - 本線: `d0` のコピーに `ALTER TABLE events ADD COLUMN duration_ms INTEGER`（ホストの python の sqlite3）→ 新サーバ → 新端末
   - (c) 同じ新サーバへ旧端末
   - (d) `d0` + 旧サーバ（= 同期忘れのサーバ）へ新端末。PostToolUse の 1 行を直接 POST して応答も見る
   - (e) `d0` + `ALTER ... duration_ms VARCHAR(255)` → 新サーバ → 新端末。列名の誤り（`duration_msec`）・表の誤り（`errors` に足す）も起動だけ見る
   - 端末は、プラグインの `hooks/collect.py` を実採取の stdin（`tests/fixtures/hook_inputs/`）で直接起動し、`_sender.py` を同期で 1 回動かす（UC46 と同じ方式）
6. `real.py`: 同じく `d0` に ALTER した DB で新サーバを立て、新プラグインを git source のマーケットプレイスから導入した隔離 config で `claude -p`（haiku・`Bash(echo:*)` だけ許可）を 1 回動かす

再現（作業コピーを作り直し、上の 1〜4 を行ってから。作業コピーは片付けた）:

```bash
set -a; . <product>/.env.local; set +a
CC_E2E_RUN=b-uc32 UC32_WORK=$TMPDIR/cc-e2e-b-uc32-work UC32_REAL=0 .venv/bin/python tmp/e2e-load-testing/uc-32-add-column/run.py
CC_E2E_RUN=b-uc32 UC32_WORK=$TMPDIR/cc-e2e-b-uc32-work .venv/bin/python tmp/e2e-load-testing/uc-32-add-column/real.py
```

## 負荷の掛け方

重い負荷ではない（サーバのコンテナを延べ 9 つ、順に起動。実セッション 2 回）。`heavy.lock` は取っていない。

## 結果

測定条件: macOS・Colima（2 CPU・3 GiB）。サーバは `e2e/_server.py` と同じ形（`python:3.9-slim` + entry.sh + waitress + BASE_PATH、SQLite）。`claude` 2.1.283・haiku。2026-09-27。
ログと生の結果は `.local/e2e-load-testing/uc-32-add-column/`（`run.log`・`result.json`・`real.log`・`result-real.json`・pytest のログ）。

**判定: 手順どおりなら既存 DB の新しい列まで値が届く（実セッションで確認）。順序の誤り 5 種のうち明示的に止まるのは (b) と ALTER の名前・表の誤りだけで、(a)(c)(d)(e) はサーバが動いたまま無言でずれる。(a) は開発者側の検査（`--check`・`pytest tests`）だけが捕まえる。**

### 本線（手順どおり）

| 観点 | 結果 |
| --- | --- |
| 新サーバの起動（ALTER 済みの既存 DB） | 起動（約 1.1 秒で待受） |
| 実採取の stdin 6 行（PostToolUse 3・PostToolUseFailure 1・UserPromptSubmit・Stop） | 6/6 保存。`duration_ms` は 1846 / 189 / 230 / 387（`integer`）で端末のキューの値と一致。ほかの hook は NULL |
| 既存の行（旧サーバ時代の 6 行） | `duration_ms` は NULL（文書どおり） |
| 実セッション（`claude -p`、17 秒） | SessionStart・UserPromptSubmit・PostToolUse・Stop の 4 行が保存され、PostToolUse の `duration_ms` = 6451（`integer`） |
| `pytest tests`（同期後・固定リストのテストを直した後） | 523 passed・1 failed（`test_statusline.py::test_git_dir_prints_branch_line`。作業コピーが git リポジトリでないため。wt-b では通る。列の追加とは無関係） |

実セッションでは、セッションの終わりまでに届いたのは SessionStart の 1 行だけだった。送信は SessionStart・Stop で「前の送信から 10 分以上」のときだけ起きる設計で、残りはキューに残る。`_sender.py` を手で 1 回動かして届けた（設計どおりで欠陥ではない。ただし「セッション直後に DB を見る」確かめ方は偽の失敗になる）。

### 順序を誤ったとき

| ケース | 止まり方 | どこに何が出るか |
| --- | --- | --- |
| (a) 同期忘れ（No.71） | **サーバは起動し、動き続ける。**実行時の姿は (d) と同じ（新しい列は無言で捨てられる） | `sync_contract.py --check` が exit 1（`contract.sha256 が正本の現在のハッシュと一致しない`・複製が正本と一致しない）。`pytest tests` が 3 件落ちる（`test_contract_sync.py::test_master_replica_hash_in_sync` と、列の並びを固定した 2 件）。**`entry.sh` の照合は exit 0**（複製とハッシュ記録が互いに一致したままだから） |
| (b) ALTER 忘れ（No.72） | **起動を中止**（コンテナは約 1.2 秒で exit 1） | コンテナのログだけ: `RuntimeError: 契約に存在するが実テーブルに無い列がある: events: duration_ms`（waitress の import 中のトレースバック）。HTTP は待ち受けない |
| (b) の後に ALTER して再起動 | 起動する | 本線と同じ |
| (c) サーバだけ新しく端末が古い | 止まらない。**無言で NULL** | 6/6 保存・`duration_ms` はすべて NULL。応答・ログに何も出ない（端末が送っていないので正しい挙動） |
| (d) 端末だけ新しくサーバが古い | 止まらない。**無言で捨てる** | 6/6 保存。PostToolUse の行を直接 POST すると `200 {"stored": 1, "dropped": 0}`。サーバのログにも出ない。ALTER していない旧 DB なので、あとから取り戻す手段はない |
| (e) 型を誤った ALTER（`VARCHAR(255)`） | **起動する**（起動時の検査は列名しか見ない） | 値は `'1846'` などの **text** で入る。同じデータで `sum(duration_ms>1000)` が 4（正しくは 1）、`max(duration_ms)` が `'387'`（正しくは 1846）。`sum()` は 2652 で一致。無言で集計が誤る |
| (e) 列名の誤り（`duration_msec`） | 起動を中止 | (b) と同じ文言。足した誤った列は残る |
| (e) 表の誤り（`errors` に足す） | 起動を中止 | (b) と同じ文言。「どの表に足すか」は文言の `events:` で分かる |

緑の確認（ゲートしているか）: (a) は同期前に `--check`・`pytest` が落ち、同期後に通ることで確かめた。(b) は ALTER を飛ばすと落ち、足すと通ることで確かめた。`run.py` の突き合わせ（`summarize` の `match`）は (e) で text と int の食い違いを `false` にした。

## 想定外だったこと

- `docs/spec/server.md` の「契約の複製」は、`entry.sh` の照合で「**複製の直接編集と同期忘れ**をここで検出する」と書くが、同期忘れは検出しない（(a)。仮説どおり。No.71 の補足とも一致）
- `docs/guide/release.md` の「6. 確認項目」は同期を `policy.py` についてしか書いていない（`contract.py` を変えたときの同期が確認項目に無い）
- 列を足すと `tests/plugin/test_contract_constants.py::test_events_column_order` と `tests/plugin/test_contract_ddl.py::test_events_columns_are_extra_columns_then_hook_fields` が落ちる（列の並びを固定している）。落ちること自体は変更を意識させる働きがあるが、手順に書かれていない
- (b) の起動中止は約 1 秒で起き、出るのはプロセスのログだけ。AIP で「起動に失敗した Function」がどう見え、再起動を繰り返すかは分からない（未検証）
- 手順は「ALTER を手で実行」とだけ書き、**どこで・何で実行するか**が無い。サーバのイメージには `sqlite3` CLI が無く（`_server.py` の註記）、止めたコンテナには exec できない。この検証ではホストの python の `sqlite3` で行った
- 端末だけ新しい期間（(d)）の値は、ALTER の前なので戻らない。release.md の「サーバ側で列の追加を先に済ませる」の理由として、この欠損が書かれていない
- 実採取の stdin で `collect.py SessionStart` を起動しても events の行は増えなかった（7 hook → 6 行）。実セッションでは SessionStart の行が届いている。SessionStart の行を作る経路が別にあると推測するが、確かめていない

## 課題と改善案

- **文書（`docs/spec/server.md`）**: 「複製の直接編集と同期忘れをここで検出する」を「複製の直接編集（ハッシュ記録と食い違う編集）を検出する。同期忘れは複製とハッシュが一致したままなので検出せず、`sync_contract.py --check` と `tests/integration/test_contract_sync.py` が捕まえる」に直す
- **文書（`docs/guide/release.md` 6・11）**: 確認項目の同期を「`contract.py` か `policy.py` を変えたら」に広げる。11 に次を足す
  - 型は契約の型と同じにすること（起動時の検査は列名だけを見る。SQLite では型を誤っても起動し、比較・`max` が無言で誤る）
  - 実行のしかた（SQLite: サーバを止め、DB ファイルに対して `python3 -c "import sqlite3; c=sqlite3.connect('<path>'); c.execute('ALTER TABLE events ADD COLUMN <列> <型>'); c.commit()"`。イメージに `sqlite3` CLI は無い）と、実行後に `PRAGMA table_info(events)` で型を確かめること
  - 端末を先に配ると、ALTER までの値は旧サーバが捨て、戻らないこと
  - 列の並びを固定したテスト 2 件を直すこと
- **コード（起動時の検査。本物に入れるか要判断）**: `db._check_contract_columns` で列名に加えて**宣言型**も突き合わせる（SQLite は `PRAGMA table_info` の `type`、MySQL は `SHOW COLUMNS` の `Type`）。(e) を明示的に止められる。MySQL の型表記（`varchar(255)`・`int`）との正規化が要る。設計判断 19（`docs/decisions/server.md`）の範囲の拡張として扱う
- **コード（`entry.sh`、要判断）**: 同期忘れをサーバ側で捕まえる手段は構造上無い（正本がサーバに無い）。代わりに `/ingest` の応答やログに「契約外のキーを受け取った」件数を出せば (a)(d) が見える。ただし旧版の端末の混在期（逆向き）には常に出るので、`docs/decisions/` での判断が要る
- **`e2e/`**: No.32 の「新しい列の値が DB に入ること」を判定する項目を足す候補。`test_send` の到達確認で、`HOOK_FIELDS` の各列について「端末のキューで非 NULL の値が、DB の同じ `event_id` の行で同じ値・同じ型か」を見る（`run.py` の `summarize` の形）。型の食い違い（(e) 相当）もこれで捕まる。既存 DB の ALTER の経路は E2E に向かない（`server/tests` に「旧 DDL の表 + ALTER 後に `init()` が通り、INSERT できる」を置くほうが安い）
- **`e2e.md`・e2e スキル**: 「サーバ（モジュール 7）」に、ハッシュ照合が見るのは複製とハッシュの組だけで同期忘れは通ると明記する。実セッション直後の DB は、送信の間隔（10 分）のためまだ一部しか届いていないことを「前提と罠」に足す
- **`docs/knowledge/`**: `db-and-framework-facts.md` に「SQLite は `ALTER TABLE ADD COLUMN <VARCHAR>` の列に整数を入れると text で保存し、整数リテラルとの比較も text 比較になる（`'189' > 1000` が真）」を足す

## 片付けたもの・残したもの

- 片付けた: 作業コピー `$TMPDIR/cc-e2e-b-uc32-work`（シンボリックリンクが無いことを確かめてから削除）、ラベル `cc-e2e=b-uc32` のコンテナ・イメージ（0 件を確認）、`E2ERoot` の隔離ルート（スクリプトの終わりで削除）、ログの監視プロセス
- 残した: このフォルダ（`notes.md`・`run.py`・`real.py`・`contract.diff`・`server.diff`・`tests.diff`）、`.local/e2e-load-testing/uc-32-add-column/` のログ（API キーの混入が無いことを確認）
- コードの変更: wt-b には無い（作業コピーだけで行い、差分をこのフォルダに残した）
