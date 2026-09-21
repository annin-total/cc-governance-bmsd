# [3] 端末：設定の自動適用とお知らせ

**目的:** SessionStart のたびに `settings.json` へポリシー値を強制適用し、未読のお知らせを利用者に見せ、その結果を policy イベントとして残す。
**設計書:** `../design.md` §3.6 / §3.7
**依存:** [1] 契約と基盤 / [2] 端末：収集
**ブランチ:** `feat/client-policy-notices`

---

この計画には、**このシステム全体で唯一、利用者の端末に実害を出しうる処理**が含まれる。書き換え対象は利用者が日常的に使っている実ファイルであり、壊せば Claude Code 本体の設定が失われる。`_settings.py` は TDD で進める（計画索引 §4）。

---

## 1. 作るもの

| ファイル | 責務 | 想定行数 |
| --- | --- | --- |
| `governance/hooks/_settings.py` | 設定ファイルの読み取り・`.` 区切りパスの解決・mtime 検査・原子的置換・キーごとの適用結果の返却 | 60 |
| `governance/hooks/session_start.py` | 設定の適用 → お知らせの表示 → イベントの収集。policy イベントの組み立てとキュー投入 | 95 |
| `governance/notices.json` | お知らせ文面。ロジックを持たない純データ | 10 |
| `governance/.claude-plugin/plugin.json` | プラグイン定義（`name` / `version` / `description`） | 6 |
| `governance/hooks/hooks.json`（追記） | `SessionStart` の登録 1 ブロック | +8 |
| `tests/client/test_settings.py` | `_settings.py` の TDD | 150 |
| `tests/client/test_session_start.py` | 出力経路・実行順序・無効化スイッチ | 120 |

`_settings.py` はキューにも契約にも触れない。**受け取るのは設定ファイルのパスと `POLICY`、返すのはキーごとの `(key_name, value, prev_value, apply_result)` の list だけ**とする。policy イベントの組み立てとキュー投入は `session_start.py` が行う。こうすると、実害の出る処理を、キューも識別子もファイルシステム以外の依存も持たない 1 ファイルに閉じ込められ、テストが設定ファイル 1 枚だけで完結する。

---

## 2. この計画に固有の前提

| 項目 | 置く前提 |
| --- | --- |
| コマンドのカレントディレクトリ | すべて `cc-governance-bmsd/`。本書のパスはこのディレクトリからの相対で書く |
| テストの置き場所 | `cc-governance-bmsd/tests/client/`（README §4）。**`governance/` の中には置かない**（このフォルダはそのままマーケットプレイスへ差し込まれる。設計書 §8.3） |
| `POLICY` の中身 | `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` = `"60"`、`extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate` = `True`、`env.FORCE_AUTOUPDATE_PLUGINS` = `"1"` の 3 項目（設計書 §3.6）。テストは項目数に依存しない書き方にする。本書の表では、この 3 つを `env.PCT` / `…autoUpdate` / `env.FORCE` と略記する |
| 入れ子のエントリの新規作成 | **`env` セクションは無ければ作ってよいが、それ以外は作らない**（設計書 §3.6）。`extraKnownMarketplaces.<名前>` はマーケットプレイスの登録が作るエントリであり、こちらが作ると `source` を持たない壊れた定義が利用者の設定に生まれる。エントリが無ければ書かずに `skipped_missing` を記録する |
| 自動更新の設定の性質 | マーケットプレイスの登録をやり直すと外れうるため、**一度合わせたら終わりではなく、毎回のセッション開始で戻す対象である**（設計書 §8.5）。既に正しい値なら `already_ok`、外れていれば `applied`、エントリそのものが無ければ `skipped_missing` になる |
| `FORCE_AUTOUPDATE_PLUGINS` を配る理由 | Claude Code 本体の自動更新を止めている端末でも、プラグインの更新だけは生かすため（設計書 §3.6）。組織の方針で本体の更新を抑止していると、それに巻き込まれて配布経路が死ぬ |
| `60` が効く理由 | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` は 1〜100 の割合で、低い値ほど早く自動圧縮が走る。**既定より高い値は無視される。** `60` は既定より低いため効く |
| `env` が hook に渡ること | `settings.json` の `env` に書いた環境変数は、hook プロセスを含む子プロセスに渡る。実機確認（タスク 12）はこれを利用する |
| 設定ファイルのパスの解決 | 環境変数 `CLAUDE_CONFIG_DIR` があればそのディレクトリ、無ければ `~/.claude` の下の `settings.json`。Claude Code 自身が設定ディレクトリを同じ規則で解決するため、差し替えても本体と対象がずれない。**`CLAUDE_CONFIG_DIR` が実際に効くかはタスク 12 で確認する。効かなければ実機確認を `HOME` 差し替えに切り替える**（コード側の規則は変えない） |
| 状態ディレクトリ（`seen.json`）のパス | [2] の `_identity` / `_queue` が使う解決規則にそのまま従う（`${CLAUDE_PLUGIN_DATA}`、無ければ `~/.claude/cc-governance/`）。この計画で別の規則を作らない |
| お知らせの見え方 | 表示には **`SessionStart:<source> says: ` の接頭辞**が付く（`source` は `startup` / `resume` / `clear` / `compact`）。複数行では接頭辞が付くのは 1 行目だけである。**お知らせ 1 件は 2,000 文字未満**に収める（設計書 §3.7） |
| `value` / `prev_value` の文字列表現 | 契約の `coerce(value, "VARCHAR(255)")` に従う（設計書 §3.2 の型変換の表）。文字列はそのまま、真偽値は `true` / `false`（小文字）、数値は十進表記、キーが無い場合は `None` |
| 適用の対象範囲 | `POLICY` に列挙されたキーだけ。撤回（`POLICY` から消えたキーの削除）は行わない（設計書 §8.3） |
| 上書き前の値の保存 | しない（設計書 §11.2）。`prev_value` として policy イベントに載せるところまでが保存の全部である |
| 既にポリシー対象のキーが別の値で設定されている端末 | 実在する。その端末は `prev_value` が利用者の元の値になり、未準拠として画面に出る。**設計どおりの挙動であり、上書きしてよい**（設計書 §3.6 の「強制のみ」） |

### 書き込み失敗の扱い

書き込み自体の失敗（`os.replace` の失敗・一時ファイルへの書き込みの失敗・ディスク不足・権限不足）は、`apply_result` の 6 区分のうち `write_failed` として記録する（設計書 §3.6・§5.2）。例外は呼び出し元に漏らさず、一時ファイルを残さず、**そのキーの policy イベントは積む。** 積まなければ、書き込みに失敗し続けている端末が画面から静かに消える。同じ計画の「エラーでもイベントは積む」（タスク 7-5）と同じ理由である。この区分はタスク 4-9 / 4-10・6-6・7-6 で固定する。

---

## 3. タスク

### タスク 1: `plugin.json` とテストの土台

**ファイル:** `governance/.claude-plugin/plugin.json`, `tests/client/`
**依存:** [1] [2]
**やること:**

- `plugin.json` に `name` = `governance`、`version` = `0.1.0`、`description` を置く。**版を上げる場所はこのファイルの `version` 1 か所だけである**（設計書 §8.3）
- [2] が用意した `tests/client/` をそのまま使う。import 経路は `tests/conftest.py` にあり、この計画で別の経路を作らない
- テストの設定ファイルは、すべて pytest の `tmp_path` の下に置く。**リポジトリ内の実ファイルも、実行中の端末の `~/.claude/settings.json` も、テストから一切触らない**

**根拠:** 設計書 §3.1 / §8.3

**テスト:** なし（土台）

**完了の判定:**

```
$ python -m pytest tests/client/ -q
153 passed
```

（[2] が置いた端末側のテストが、土台を触っても通ったままであることを確かめる）

```
$ python -c "import json;d=json.load(open('governance/.claude-plugin/plugin.json'));print(d['name'],d['version'])"
governance 0.1.0
```

**コミット:** `feat: プラグイン定義と端末側テストの土台を置く`

---

### タスク 2: `_settings.py` — 読み取りと `prev_value` の解決

**ファイル:** `governance/hooks/_settings.py`, `tests/client/test_settings.py`
**依存:** タスク 1
**やること:** 設定ファイルを読み、`.` 区切りのパスで現在値をたどって `prev_value` を求める。この段階では書き込みを行わない。

**根拠:** 設計書 §3.6 手順 1・2、§5.2（`prev_value` が準拠判定の材料である）

**テスト:**

期待値は `env.PCT` / `…autoUpdate` / `env.FORCE` の順に書く。

| # | 入力（`settings.json` の中身） | 期待値 |
| --- | --- | --- |
| 2-1 | `{}` | `None` / `None` / `None` |
| 2-2 | ファイルが存在しない | 2-1 と同じ。例外を投げない |
| 2-3 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"80"}}` | `"80"` / `None` / `None` |
| 2-4 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"60"},"extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"autoUpdate":true}}}` | `"60"` / `"true"` / `None` |
| 2-5 | `{"extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"autoUpdate":false}}}` | `None` / `"false"` / `None`（**`false` を「キーが無い」と混同しない**） |
| 2-6 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":60}}`（数値） | `"60"`（十進表記の文字列） / `None` / `None` |
| 2-7 | `{"env":"proxy"}`（`env` が dict でない） | 3 つとも `None`。例外を投げない |
| 2-8 | `{"env":{}}` | 3 つとも `None` |
| 2-9 | `{"env":{"FORCE_AUTOUPDATE_PLUGINS":"1"}}` | `None` / `None` / `"1"`（同じ `env` セクションから 2 本のキーパスを独立に引く） |

**完了の判定:**

```
$ python -m pytest tests/client/test_settings.py -q -k read
9 passed
```

**コミット:** `feat: settings.json の読み取りと prev_value の解決`

---

### タスク 3: `_settings.py` — 差分がなければ書かない

**ファイル:** `governance/hooks/_settings.py`, `tests/client/test_settings.py`
**依存:** タスク 2
**やること:** ポリシー値と現在値を比較し、**全項目が一致するときはファイルを開かない**。結果は `already_ok`。

**根拠:** 設計書 §3.6 手順 2

**テスト:**

| # | 入力 | 期待値 |
| --- | --- | --- |
| 3-1 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"60","FORCE_AUTOUPDATE_PLUGINS":"1"},"extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"autoUpdate":true}}}` | 3 キーとも `apply_result` = `already_ok` |
| 3-2 | 3-1 と同じ。実行前に `os.utime` で `st_mtime_ns` を固定値に設定 | 実行後の `st_mtime_ns` が実行前と**ビット一致** |
| 3-3 | 3-1 と同じ | ファイルのバイト列が 1 バイトも変わらない（整形・キー順の入れ替えも起きない） |
| 3-4 | 3-1 と同じ | 同じディレクトリに一時ファイルが残らない（実行後のディレクトリ内のファイル数が 1） |
| 3-5 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"60"},"extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"autoUpdate":true}}}`（`env.FORCE_AUTOUPDATE_PLUGINS` が無い） | `env.PCT` → `already_ok`、`…autoUpdate` → `already_ok`、`env.FORCE` → `applied`。**1 項目でも差分があれば書く** |
| 3-6 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":60,"FORCE_AUTOUPDATE_PLUGINS":"1"}}`（数値の 60） | `env.PCT` → `applied`（文字列 `"60"` に書き換える。型の差を一致とみなさない） |
| 3-7 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"60","FORCE_AUTOUPDATE_PLUGINS":"1"}}`（`extraKnownMarketplaces` が無い） | `env` の 2 つ → `already_ok`、`…autoUpdate` → `skipped_missing`。**`st_mtime_ns` が不変**（書ける差分が 1 つも無いのでファイルを開かない） |

**完了の判定:**

```
$ python -m pytest tests/client/test_settings.py -q -k already_ok
7 passed
```

**コミット:** `feat: ポリシー値と一致していれば settings.json を書かない`

---

### タスク 4: `_settings.py` — 適用（既存設定の保全・入れ子への書き込み・原子的置換）

**ファイル:** `governance/hooks/_settings.py`, `tests/client/test_settings.py`
**依存:** タスク 3
**やること:** 差分のあるキーだけを書き込む。**同じディレクトリに一時ファイルを作り、`os.replace` で置き換える**（別ディレクトリに作るとクロスデバイスで `os.replace` が失敗する）。書き込むのは読み取った dict にポリシー値を反映したものであり、ポリシー対象外のキーには触れない。書き換えるのは末端の 1 キーだけとする。書き込みに失敗したときは例外を外に出さず、一時ファイルを残さず、差分のあったキーの結果を `write_failed` とする。

**入れ子のエントリを新規に作らない。** `env` セクションだけは無ければ作る。それ以外の段が欠けているときは、そのキーを書かずに `skipped_missing` を返す。`extraKnownMarketplaces.<名前>` はマーケットプレイスの登録が作るエントリであり、こちらが作ると **`source` を持たない壊れた定義**が利用者の設定に生まれる。**ここは利用者の設定を壊す経路であり、テストを落とさない。**

**根拠:** 設計書 §3.6 手順 4、同節「入れ子の途中のキーが存在しないとき」

**テスト:**

保全の基準入力を 1 つ決め、以降これを「基準」と呼ぶ。

```
{"model":"opus","permissions":{"allow":["Bash(ls:*)"]},
 "env":{"HTTP_PROXY":"http://proxy.example:8080"},
 "statusLine":{"type":"command","command":"echo hi"}}
```

| # | 入力 | 期待値 |
| --- | --- | --- |
| 4-1 | 基準 | 実行後のトップレベルのキーは `model` / `permissions` / `env` / `statusLine` の 4 つ。**元の 4 つが 1 つも失われず、`extraKnownMarketplaces` も増えない** |
| 4-2 | 基準 | `model` == `"opus"`、`permissions` == `{"allow":["Bash(ls:*)"]}`、`statusLine` == `{"type":"command","command":"echo hi"}`（値も変わらない） |
| 4-3 | 基準 | `env` のキーは `HTTP_PROXY` / `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` / `FORCE_AUTOUPDATE_PLUGINS` の 3 つ。`env.HTTP_PROXY` == `"http://proxy.example:8080"` |
| 4-4 | 基準 | `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` == `"60"`、`env.FORCE_AUTOUPDATE_PLUGINS` == `"1"`。`…autoUpdate` は `skipped_missing` で書かれない |
| 4-5 | `{}` | `env` セクションが新規に作られ、`{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"60","FORCE_AUTOUPDATE_PLUGINS":"1"}` になる。トップレベルのキーは `env` の 1 つだけ |
| 4-6 | ファイルが存在しない | ファイルが新規に作られ、内容は 4-5 と同じ。`apply_result` は `env` の 2 つが `applied`、`…autoUpdate` が `skipped_missing` |
| 4-7 | 基準 | 実行後のファイルが JSON として読み直せる。末尾に改行が 1 つある |
| 4-8 | 基準 | 実行後、同じディレクトリに一時ファイルが残らない（ファイル数が 1） |
| 4-9 | 基準。`os.replace` を例外を投げるものに差し替える | 例外が呼び出し元に漏れない。**元のファイルのバイト列と `st_mtime_ns` が不変**。一時ファイルが残らない。差分のあったキーの `apply_result` が `write_failed` |
| 4-10 | 基準。一時ファイルへの `write` を途中で例外にする | 4-9 と同じ |
| 4-11 | 基準に `"extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"source":{"source":"github","repo":"x/y"},"autoUpdate":true}}` を足したもの | `…autoUpdate` → `already_ok`、`env` の 2 つ → `applied`。書き込み後も `…autoUpdate` == `true`、`source` が保たれる |
| 4-12 | 基準に `"extraKnownMarketplaces":{"other-marketplace":{"autoUpdate":true},"cc-marketplace-governance-bmsd":{"source":{"source":"github","repo":"x/y"},"autoUpdate":false}}` を足したもの（登録をやり直して自動更新が外れた状態） | `…autoUpdate` → `applied` で `true` に戻る。`other-marketplace` のエントリと、同じエントリ内の `source` が**1 つも失われない**（書き換えるのは末端 1 キーだけ） |
| 4-13 | 基準（`extraKnownMarketplaces` そのものが無い） | `…autoUpdate` → `skipped_missing`。実行後のファイルに `extraKnownMarketplaces` が**現れない** |
| 4-14 | 基準に `"extraKnownMarketplaces":{"other-marketplace":{"source":{"source":"github","repo":"x/y"},"autoUpdate":true}}` を足したもの（その名前のエントリが無い） | `…autoUpdate` → `skipped_missing`。`cc-marketplace-governance-bmsd` のエントリが**作られない**。`other-marketplace` が 1 つも失われない |
| 4-15 | 基準に `"extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"source":{"source":"github","repo":"x/y"}}}` を足したもの（エントリはあるが `autoUpdate` キーが無い） | `…autoUpdate` → `applied`。`autoUpdate` == `true` になり、`source` が失われない（**末端キーの欠落はエントリの欠落ではない**） |

ケース 4-13 / 4-14 / 4-15 が境界である。**作ってよいのは `env` セクションだけであり、`extraKnownMarketplaces` の段は作らない。** 作ると `source` を持たない壊れた定義が利用者の設定に残る。

**完了の判定:**

```
$ python -m pytest tests/client/test_settings.py -q -k apply
15 passed
```

**コミット:** `feat: settings.json への原子的な書き込みと既存設定の保全`

---

### タスク 5: `_settings.py` — mtime の衝突とパース失敗

**ファイル:** `governance/hooks/_settings.py`, `tests/client/test_settings.py`
**依存:** タスク 4
**やること:**

- 読み取り時に `st_mtime_ns` を控え、**一時ファイルを置き換える直前に読み直す**。異なっていたら今回は書かずに `skipped_conflict` を返す
- JSON のパースに失敗したら**何もせず** `parse_failed` を返す
- 比較には `st_mtime_ns` を使う。秒単位では同一秒内の書き換えを取りこぼす

**根拠:** 設計書 §3.6 手順 3・5。`os.replace` が保証するのはファイル置換の原子性だけで、read-modify-write の lost update を防がない。Claude Code 自身も `/config` などで同じファイルを書く。

**テスト:**

衝突の再現は「読み取り後・置換前に、テスト側が同じパスを別内容で上書きし、`os.utime` で `st_mtime_ns` を確実にずらす」方法で行う。

| # | 入力と割り込み | 期待値 |
| --- | --- | --- |
| 5-1 | `{"model":"opus","extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"source":{"source":"github","repo":"x/y"}}}}` → 割り込みで `{"model":"sonnet"}` に上書き | 3 キーとも `apply_result` = `skipped_conflict`（3 キーすべてが書き込み対象になる入力を使う） |
| 5-2 | 5-1 と同じ | **実行後のファイルの内容が `{"model":"sonnet"}` のまま。**`env` も足されておらず、`extraKnownMarketplaces` も戻っていない（利用者の変更が黙って巻き戻らない） |
| 5-3 | 5-1 と同じ | `prev_value` は**読み取り時点の値**（3 つとも `None`）。割り込み後の値を読み直さない |
| 5-4 | 5-1 と同じ | 一時ファイルが残らない |
| 5-5 | 割り込みで**内容は同じだが mtime だけ進める** | `skipped_conflict`。内容の比較ではなく mtime の比較で諦める |
| 5-6 | `{"model":"opus"` （閉じ括弧が無い） | 3 キーとも `parse_failed`。**ファイルのバイト列と `st_mtime_ns` が不変** |
| 5-7 | 5-6 と同じ | `prev_value` は `None`。例外が呼び出し元に漏れない |
| 5-8 | 空ファイル（0 バイト） | `parse_failed`。ファイルが 0 バイトのまま |
| 5-9 | `[1,2,3]`（トップレベルが list） | `parse_failed`。ファイル不変 |
| 5-10 | 読み取り権限の無いファイル | `parse_failed`。例外が漏れない |

**完了の判定:**

```
$ python -m pytest tests/client/test_settings.py -q
41 passed
```

```
$ wc -l governance/hooks/_settings.py
      60 governance/hooks/_settings.py
```

（200 行以内であればよい）

**コミット:** `feat: mtime の衝突とパース失敗で settings.json を触らない`

---

### タスク 6: `apply_result` の 6 通りが揃うことの確認

**ファイル:** `tests/client/test_settings.py`
**依存:** タスク 5
**やること:** 6 つの区分がそれぞれ独立したテストケースとして出ることを、1 つのテストで横断的に確かめる。`prev_value` の 3 通り（キーが無い / 別の値 / 既にポリシー値）も併せて縛る。

**根拠:** 設計書 §3.6（policy イベントが持つもの）、§5.2（準拠の判定は `prev_value` で行う）

**テスト:**

| # | 入力 | `prev_value`（`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`） | `apply_result` |
| --- | --- | --- | --- |
| 6-1 | `{}` | `None` | `applied` |
| 6-2 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"80"}}` | `"80"` | `applied` |
| 6-3 | `{"env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"60","FORCE_AUTOUPDATE_PLUGINS":"1"},"extraKnownMarketplaces":{"cc-marketplace-governance-bmsd":{"autoUpdate":true}}}` | `"60"` | `already_ok` |
| 6-4 | 5-1 と同じ入力 + 割り込み（タスク 5 と同じ） | `None` | `skipped_conflict` |
| 6-5 | 壊れた JSON | `None` | `parse_failed` |
| 6-6 | `{}` + `os.replace` を例外にする（タスク 4-9 と同じ） | `None` | `write_failed` |
| 6-7 | `{}`（`…autoUpdate` の行を見る） | — | `skipped_missing`（`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` の行は `applied`） |
| 6-8 | 6-1〜6-7 をまとめて実行 | — | 観測された `apply_result` の集合が `{already_ok, applied, skipped_conflict, skipped_missing, parse_failed, write_failed}` と**完全に一致**する |
| 6-9 | 6-1〜6-7 | `value` はすべての場合に、そのキーのポリシー値（書けたかどうかに依らない） | — |

**完了の判定:**

```
$ python -m pytest tests/client/test_settings.py -q -k result
9 passed
```

**コミット:** `test: apply_result の 6 区分と prev_value の 3 通りを縛る`

---

### タスク 7: `session_start.py` — 設定の適用と policy イベントの投入

**ファイル:** `governance/hooks/session_start.py`
**依存:** タスク 6、[2]（`_queue` / `_identity`）
**やること:** `_settings` の返す結果 1 件につき policy イベントを 1 行、[2] のキューに積む。イベントが持つのは `event_id` / `ts` / `day` / `user_email` / `host` / `key_name` / `value` / `prev_value` / `apply_result` / `plugin_version`。

`plugin_version` は `plugin.json` の `version` を読んで得る（[2] の `_identity` が同じ値を解決していればそれを使い、この計画で読み取りを二重に持たない）。

**根拠:** 設計書 §3.6（policy イベントが持つもの）、§5.2

**テスト:**

| # | 入力 | 期待値 |
| --- | --- | --- |
| 7-1 | 基準（タスク 4） | キューに積まれる policy イベントが 3 行（`POLICY` の項目数と一致） |
| 7-2 | 7-1 | 各行の `key_name` が `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` / `extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate` / `env.FORCE_AUTOUPDATE_PLUGINS`。`.` を含むキーがそのまま入る |
| 7-3 | 7-1 | `plugin_version` が `plugin.json` の `version`（`0.1.0`）と一致 |
| 7-4 | 7-1 | 2 行の `event_id` が互いに異なる |
| 7-5 | 壊れた JSON を与える | `parse_failed` の行が 2 行積まれる。**エラーでもイベントは積む**（未適用の端末が画面から消えない） |
| 7-6 | 書き込みを失敗させる（タスク 4-9 と同じ） | `write_failed` の行が積まれる。**書き込みに失敗し続けている端末も画面に残る** |
| 7-7 | `_queue` への追記を例外にする | 例外が漏れない。設定ファイルには既にポリシー値が入っている |
| 7-8 | `extraKnownMarketplaces` が無い状態 | `…autoUpdate` の行が `skipped_missing` として積まれる。**書けなかったキーも記録する**（この結果が出ること自体が異常の印であり、サーバに届かなければ気づけない） |

**完了の判定:**

```
$ python -m pytest tests/client/test_session_start.py -q -k policy_event
8 passed
```

**コミット:** `feat: 適用結果を policy イベントとしてキューに積む`

---

### タスク 8: `notices.json` と未読の選別

**ファイル:** `governance/notices.json`, `governance/hooks/session_start.py`
**依存:** タスク 7
**やること:** `notices.json` を `[{"id": ..., "title": ..., "body": ...}]` の配列として置く。`seen.json` に無い `id` の項目を未読とする。`seen.json` が無い・壊れている・形が違う場合は**空集合として扱い、例外にしない**。

**根拠:** 設計書 §3.7

**テスト:** fixture の `notices.json` は `id` = `n-001` / `n-002` の 2 件とする。

| # | `seen.json` | 期待値 |
| --- | --- | --- |
| 8-1 | 存在しない | 未読は `n-001`, `n-002` |
| 8-2 | `["n-001"]` | 未読は `n-002` のみ |
| 8-3 | `["n-001","n-002"]` | 未読なし |
| 8-4 | `["n-001","n-999"]`（存在しない id を含む） | 未読は `n-002`。`n-999` は無視され、例外にならない |
| 8-5 | `{"seen":["n-001"]}`（dict） | 空集合として扱い、未読は `n-001`, `n-002` |
| 8-6 | `["n-001"` （壊れた JSON） | 空集合として扱い、未読は `n-001`, `n-002` |
| 8-7 | 空ファイル | 空集合として扱う |
| 8-8 | `notices.json` が空配列 `[]` | 未読なし。例外にならない |
| 8-9 | `notices.json` が存在しない | 未読なし。例外にならない |
| 8-10 | `["n-002","n-001"]`（順序が逆） | 未読なし（順序に依存しない） |

**完了の判定:**

```
$ python -m pytest tests/client/test_session_start.py -q -k notices
10 passed
```

**コミット:** `feat: 未読のお知らせを seen.json で選別する`

---

### タスク 9: お知らせの出力経路と既読を立てる順序

**ファイル:** `governance/hooks/session_start.py`
**依存:** タスク 8
**やること:**

- 未読のお知らせを、hook の JSON 出力の **`systemMessage`** として返す。モデルに渡る経路（素の標準出力・`additionalContext`）には**一切載せない**
- **既読に加えるのは出力が成功した後**。`seen.json` の更新は、標準出力への書き出しと `flush` が例外なく終わってから行う
- 表示には **`SessionStart:<source> says: ` の接頭辞**が付く（`source` は `startup` / `resume` / `clear` / `compact`）。利用者はこの接頭辞込みで文面を読むため、**文面の先頭に「【お知らせ】」のような目印を重ねない**。複数行の場合、接頭辞が付くのは 1 行目だけである
- **お知らせ 1 件の文面は 2,000 文字未満**に収める。これを超えると Claude Code は出力をファイルに退避し、先頭のプレビューとファイルパスだけを表示する。`notices.json` の各要素がこの上限を満たすことは、リリース時の検査で見る（計画 [7]）

**根拠:** 設計書 §3.7。素の標準出力はモデルが読む文脈として扱われるため、そのまま出すとお知らせの宛先が人ではなくモデルになる。業務指示を含む文面が全セッションでモデルへの指示として注入されると、**コストを下げる施策の効果測定に、モデルの応答傾向の変化が交絡する**。

**テスト:** fixture の `n-001` の `body` に、他のどこにも現れない一意な文字列 `ZZMARKER-NOTICE-BODY` を含めておく。

| # | 入力 | 期待値 |
| --- | --- | --- |
| 9-1 | 未読 2 件 | 標準出力**全体**が JSON 1 個としてパースでき、余分な行が前後に無い |
| 9-2 | 未読 2 件 | パース結果の `systemMessage` に `ZZMARKER-NOTICE-BODY` が含まれる |
| 9-3 | 未読 2 件 | パース結果から `systemMessage` を除いた残りを JSON 文字列化したものに `ZZMARKER-NOTICE-BODY` が**含まれない** |
| 9-4 | 未読 2 件 | パース結果に `additionalContext` キーが存在しない |
| 9-5 | 未読 2 件 | 標準エラーが空。終了コードが 0 |
| 9-6 | 未読なし | `systemMessage` キーを出力に含めない（空文字列も出さない） |
| 9-7 | 未読 2 件 | 実行後の `seen.json` が `n-001` と `n-002` を含む |
| 9-8 | 未読 2 件。標準出力への書き出しを例外にする | **実行後の `seen.json` が実行前と同じ**（更新されていない）。終了コード 0 |
| 9-9 | 9-8 を実行した後、もう一度正常に実行する | `n-001`, `n-002` が改めて出力される（表示されないまま消費されない） |
| 9-10 | 未読 1 件・既読 1 件 | 実行後の `seen.json` が 2 件を含む（既存の既読が消えない） |

**完了の判定:**

```
$ python -m pytest tests/client/test_session_start.py -q -k output
10 passed
```

**コミット:** `feat: お知らせを systemMessage で返し、出力成功後に既読にする`

---

### タスク 10: 実行順序 — 適用 → お知らせ → 収集

**ファイル:** `governance/hooks/session_start.py`
**依存:** タスク 9、[2]（`collect`）
**やること:** 3 つをこの順に呼ぶ。**後段が失敗しても前段は既に終わっている**構造にする。3 つそれぞれを個別に例外から守り、1 つの失敗が残りを巻き添えにしない。終了コードは常に 0、標準エラーには何も出さない。

**根拠:** 設計書 §3.6 冒頭（収集が失敗しても、ガバナンスの本体である前 2 つは既に終わっている）、§3.3（hook は常に `exit 0`）

**テスト:**

| # | 入力 | 期待値 |
| --- | --- | --- |
| 10-1 | 正常 | `settings.json` にポリシー値が入り、`systemMessage` が出力され、キューに policy イベントと SessionStart のイベントが積まれる |
| 10-2 | **収集を例外にする** | `settings.json` にポリシー値が入っている。`systemMessage` が出力されている。`seen.json` が更新されている。終了コード 0、標準エラーが空 |
| 10-3 | お知らせの処理を例外にする | `settings.json` にポリシー値が入っている。収集が実行されている。終了コード 0 |
| 10-4 | 設定の適用を例外にする | `systemMessage` が出力され、収集が実行されている。終了コード 0 |
| 10-5 | 3 つすべてを例外にする | 終了コード 0、標準エラーが空、標準出力が JSON としてパースできる |
| 10-6 | 呼び出し順を記録して正常実行 | 記録された順序が `settings` → `notices` → `collect` |

**完了の判定:**

```
$ python -m pytest tests/client/test_session_start.py -q -k order
6 passed
```

**コミット:** `feat: 適用 → お知らせ → 収集の順に実行し、失敗を伝播させない`

---

### タスク 11: 無効化スイッチ

**ファイル:** `governance/hooks/session_start.py`
**依存:** タスク 10
**やること:** 環境変数 `CC_GOVERNANCE_DISABLE` が**空でない値**に設定されているとき、お知らせの表示と収集を飛ばす。**設定の適用・その記録・送信はこのスイッチでは止まらない。**

**根拠:** 設計書 §3.9。止められるようにすると「利用者が施策を選択的に適用できる」ことと同義になり、§3.6 が強制のみを選んだ理由（準拠者と非準拠者の差が施策の効果なのか自己選択なのかを区別できなくなる）がそのまま崩れる。

**テスト:** 入力の設定ファイルは `{}`、未読は 2 件、`seen.json` は無い状態から始める。

| # | `CC_GOVERNANCE_DISABLE` | 設定の適用 | お知らせ | 収集 |
| --- | --- | --- | --- | --- |
| 11-1 | 未設定 | `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` == `"60"` | `systemMessage` が出る / `seen.json` が 2 件 | キューの行数が増える |
| 11-2 | `"1"` | `"60"` が入る | `systemMessage` キーが出力に無い / **`seen.json` が作られない** | キューの行数が増えない |
| 11-3 | `"0"` | `"60"` が入る | 出ない | 増えない（空でない値なので止まる） |
| 11-4 | `"false"` | `"60"` が入る | 出ない | 増えない |
| 11-5 | `""`（空文字列） | `"60"` が入る | 出る | 増える（11-1 と同じ） |
| 11-6 | `"1"` | **policy イベントはキューに積まれる**（適用が止まらない以上、その記録も止めない） | — | — |
| 11-7 | `"1"` | — | 標準出力が JSON としてパースできる。終了コード 0 | — |
| 11-8 | `"1"`、送信条件が真 | **送信プロセスが 1 回起動する**（送信は止まらない） | — | — |

**このスイッチは「適用の記録」も「送信」も止めない。** 適用だけ行って記録を止めると、無効化した端末が準拠率の分母から静かに消え、施策の効果が実態より良く見える。**送信まで止めると同じことが起きる。** 積んだ policy イベントが端末に溜まるだけで、サーバには一度も届かない。止めるのは利用ログの収集とお知らせの表示であって、ガバナンスとその記録の伝達ではない。

**完了の判定:**

```
$ python -m pytest tests/client/test_session_start.py -q -k disable
8 passed
```

```
$ python -m pytest tests/client/test_settings.py tests/client/test_session_start.py -q
92 passed
```

（`tests/client/` には [2] のテストも入っているため、本計画が足した 2 ファイルに絞って数える）

**コミット:** `feat: CC_GOVERNANCE_DISABLE でお知らせと収集だけを止める`

---

### タスク 12: `hooks.json` への `SessionStart` の登録と実機確認

**ファイル:** `governance/hooks/hooks.json`（追記）
**依存:** タスク 11
**やること:**

- `SessionStart` に `session_start.py` を登録する。matcher は指定せず全 source で発火させる（`source` は hook 入力から取る。設計書 §3.2）。起動の書き方（`python3` の呼び方・`${CLAUDE_PLUGIN_ROOT}` の使い方）は [2] が他の 6 種で採ったものに揃える
- **コマンド文字列の制約も [2] と同じに揃える**（1 行・パイプや `;` や `&&` やリダイレクトを含めない・100 文字未満。設計書 §3.3）。登録する `python3 "${CLAUDE_PLUGIN_ROOT}/hooks/session_start.py" SessionStart` は 67 文字である
- `SessionStart` は `startup` / `resume` / `clear` / `compact` の **4 契機**で発火する。`/clear` のたびにも、自動圧縮が走るたびにも設定の適用とお知らせの判定が走る
- 実機確認を行う

**実機確認の手順。利用者本人の `~/.claude/settings.json` を対象にしてはならない。**

1. 作業前に、本人の設定ファイルの指紋を控える

```
$ shasum -a 256 ~/.claude/settings.json; stat -f '%m' ~/.claude/settings.json
<hash>  /Users/<user>/.claude/settings.json
<mtime>
```

2. git 管理外の `local/` の下に隔離ディレクトリを作り、そこを `CLAUDE_CONFIG_DIR` に向けて Claude Code を 1 回走らせる

```
$ mkdir -p local/isolated-claude/state
$ CLAUDE_CONFIG_DIR=$PWD/local/isolated-claude CLAUDE_PLUGIN_DATA=$PWD/local/isolated-claude/state \
    claude -p 'ok' >/dev/null
$ python -c "import json;d=json.load(open('local/isolated-claude/settings.json'));print(d['env']['CLAUDE_AUTOCOMPACT_PCT_OVERRIDE'], d['env']['FORCE_AUTOUPDATE_PLUGINS'], 'extraKnownMarketplaces' in d)"
60 1 False
```

**`extraKnownMarketplaces` が `False` になるのが正しい。** この隔離環境はマーケットプレイスを登録していないため、そのエントリが存在しない。**エントリを作らずに `skipped_missing` を記録する**のが設計である（設計書 §3.6）。ここで `True` が出たら、作ってはいけない入れ子を作っている。

`CLAUDE_PLUGIN_DATA` を向けるのは、状態ディレクトリ（`queue.jsonl` 等）を隔離側に落とすためである。向けないと利用者本人の `~/.claude/cc-governance/` に書かれる。

`local/isolated-claude/settings.json` が作られなければ `CLAUDE_CONFIG_DIR` が効いていない。その場合は `HOME` を差し替えた隔離環境に切り替える（`HOME=$PWD/local/isolated-home claude -p 'ok'`）。**どちらでも動かない場合はここで止め、本人の設定ファイルを対象にした確認に切り替えない。**

3. **作業後に指紋を取り直し、1 と一致することを確かめる**

```
$ shasum -a 256 ~/.claude/settings.json; stat -f '%m' ~/.claude/settings.json
<1 と同じ hash>  /Users/<user>/.claude/settings.json
<1 と同じ mtime>
```

4. もう一度走らせ、2 回目の policy イベントの `prev_value` が `"60"` になっていることを確かめる。**`prev_value` が `"60"` になって初めて、準拠判定の材料が成立する**（設計書 §5.2）

```
$ python -c "import json,sys;[print(e['key_name'],repr(e['prev_value']),e['apply_result']) for e in map(json.loads,open('local/isolated-claude/state/queue.jsonl')) if e.get('key_name')]"
env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE None applied
extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate None skipped_missing
env.FORCE_AUTOUPDATE_PLUGINS None applied
env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE '60' already_ok
extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate None skipped_missing
env.FORCE_AUTOUPDATE_PLUGINS '1' already_ok
```

1 回の起動につき 3 行（`POLICY` の項目数）が積まれる。`…autoUpdate` が 2 回とも `skipped_missing` であることは、この隔離環境にマーケットプレイスの登録が無いことの反映である。

5. **`systemMessage` が接頭辞つきで画面に出ることを確認する。** `notices.json` に短い文面と 1,999 文字の文面を 1 件ずつ置いて対話モードで起動し、次を見る — `SessionStart:startup says: ` の接頭辞が付くこと、1,999 文字の文面が切り詰められずファイルへの退避も起きないこと、接頭辞が付くのが 1 行目だけであること（設計書 §3.7）

6. 既に別の値を持つ端末の挙動を確認する。隔離ディレクトリの `settings.json` の `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` を手で `"95"` に書き換えてから走らせ、`prev_value` が `"95"`・`apply_result` が `applied` になり、**同じファイル内の他のキーが失われていない**ことを確かめる

**根拠:** 設計書 §3.3 / §3.7 / §11.3、計画索引 §4（hook の登録と発火は実機で確認する）

**テスト:** 上記の手順そのもの

**完了の判定:** 手順 1〜6 がすべて期待どおり。特に手順 3 で本人の設定ファイルが不変であること。

```
$ python -c "import json;print(len(json.load(open('governance/hooks/hooks.json'))['hooks']))"
7
```

**コミット:** `feat: SessionStart を登録し、隔離環境で実機確認する`

---

## 4. この計画の完了条件

| # | 条件 | 確かめ方 |
| --- | --- | --- |
| 1 | ポリシー対象外のキーが、書き込みの前後で 1 つも失われず値も変わらない | タスク 4-1 / 4-2 / 4-3 |
| 2 | `env` セクションの中に書き込め、同セクションの既存キーが保たれる。`extraKnownMarketplaces` は末端だけが書き換わり、兄弟キーと `source` が保たれる | タスク 4-3 / 4-5 / 4-12 |
| 2-b | **`env` 以外の入れ子のエントリを新規に作らない。** エントリが無ければ書かずに `skipped_missing` を記録する | タスク 4-13 / 4-14 / 4-15 |
| 3 | 差分がなければファイルを一切触らない（`st_mtime_ns` が不変） | タスク 3-2 / 3-3 |
| 4 | mtime が変わっていたら書かず、利用者の変更が巻き戻らない | タスク 5-1 / 5-2 |
| 5 | パース失敗時にファイルを一切変更しない | タスク 5-6 / 5-8 / 5-9 |
| 6 | 書き込み失敗時も元のファイルが壊れず、一時ファイルが残らず、`write_failed` が記録されてイベントも積まれる | タスク 4-9 / 4-10 / 7-6 |
| 7 | `apply_result` の 6 区分と `prev_value` の 3 通りがすべて出る | タスク 6-8 / 6-9 |
| 8 | お知らせが `systemMessage` にだけ現れ、モデルに渡る経路に現れない | タスク 9-2 / 9-3 / 9-4 |
| 9 | 出力が失敗したら既読にならず、次回また出る | タスク 9-8 / 9-9 |
| 10 | `seen.json` が壊れていても例外にならない | タスク 8-5 / 8-6 / 8-7 |
| 11 | 収集が失敗しても設定の適用とお知らせは完了している | タスク 10-2 |
| 12 | `CC_GOVERNANCE_DISABLE` で止まるのはお知らせと収集だけで、適用・記録・送信は止まらない | タスク 11-2 / 11-6 / 11-8 |
| 13 | 終了コードが常に 0 で、標準エラーが空 | タスク 10-5 / 11-7 |
| 14 | `_settings.py` と `session_start.py` が 200 行以内 | タスク 5 / タスク 11 の `wc -l` |
| 15 | 実機で隔離環境の設定ファイルだけが書き換わり、本人のものは不変 | タスク 12 手順 3 |
| 16 | 2 回目の起動で `prev_value` が `"60"` になる | タスク 12 手順 4 |
| 17 | `systemMessage` が `SessionStart:<source> says: ` の接頭辞つきで表示され、1,999 文字の文面が切り詰められない | タスク 12 手順 5 |
| 18 | 隔離環境に `extraKnownMarketplaces` が作られず、`…autoUpdate` が `skipped_missing` として記録される | タスク 12 手順 2 / 手順 4 |

完了したら `feat/client-policy-notices` を `main` にマージする。

---

## 5. この計画で確かめないこと

| 範囲 | どこで担保するか |
| --- | --- |
| `POLICY` に何を入れるか、その値が妥当か | [0] / [1] |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` が実際に自動圧縮を早めるか | [0] で確認済み。この計画は「`settings.json` に書けること」までを担保する |
| 上位の設定層（マネージド設定・コマンドラインでの指定・`settings.local.json`・プロジェクトの `settings.json`）が同じキーを持つときの実効性 | 確かめない。書き込むのは最も弱い層であり、「書けたこと」は「効いていること」ではない（設計書 §11.2） |
| 上書きする前の利用者固有の値の復元 | 持たない（設計書 §11.2）。`prev_value` として記録するところまでが全部 |
| `POLICY` から消したキーの撤回 | 定義しない（設計書 §8.3）。誤った値は正しい値を配り直して上書きする |
| `_queue` / `_identity` / `collect` の実装と、送信プロセスの起動 | [2] |
| policy イベントがサーバに届き `policy_state` に入ること | [4] |
| 準拠率・準拠開始日・`plugin_version` の分布の集計と画面 | [5] |
| 複数セッションが同時に起動したときの `settings.json` への同時書き込み | mtime の検査で片方が諦めることはタスク 5 で確かめるが、複数プロセスを同時に走らせる再現テストは持たない |
| `notices.json` の文面の中身・配信の運用 | 運用。git push が配信の実体である（設計書 §3.7） |
| マーケットプレイスへの差し込みと `version` の引き上げ運用 | [7] |
