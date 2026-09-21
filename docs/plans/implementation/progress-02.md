# 計画 [2] 端末：イベントの抽出・蓄積・送信 — 進捗と裁定

ブランチ: `feat/client-collection` ／ 作業ツリー: 開発リポジトリ本体（端末トラック）

---

## 着手前に実測した事実

| 事項 | 結果 |
| --- | --- |
| hook 入力の実サンプル | `local/fixtures/cc-fixtures-2026-09-21/` に **112 件**。計画書の期待と一致 |
| hook 種別の内訳 | PostToolUse 60 / UserPromptSubmit 16 / Stop 11 / SessionStart 9 / SessionEnd 8 / UserPromptExpansion 4 / PostToolUseFailure 3 / PreCompact 1。**計画書の期待と完全に一致** |
| `jq` | `/usr/bin/jq` にある。タスク 1 の判定コマンドがそのまま通る |
| タスクごとのテスト件数の合計 | 12 + 30 + 12 + 23 + 22 + 20 + 15 + 20 = **154**。完了条件と一致 |

## 事前スキャン

| # | 対象 | 突き合わせたこと | 結果 |
| --- | --- | --- | --- |
| 1 | タスク 1 の `ls \| wc -l` = 112 | 実サンプルの件数 | 一致 |
| 2 | タスク 1 の `jq` による hook 種別の内訳 | 実サンプルの内訳 | 一致 |
| 3 | タスク 1 の `grep -rl 'SENTINEL-' \| wc -l` = **95** | 自由文キーを持つファイル数 | **素直な解釈では 94。1 件の差 → 裁定 R-19** |
| 4 | 各タスクのテスト件数の合計 ↔ 完了条件の 154 | — | 一致 |
| 5 | タスク 1・3 が変更する `tests/conftest.py` ↔ 計画 [4] も同じファイルを変更する | 並列トラックの衝突 | 衝突しうる。突き合わせ時に解消する（進行方針に記載済み） |
| 6 | 完了条件 6「`prompt` / `tool_response` / `message` に触れるコードが無い」↔ タスク 4 のテストがこれらのキー名を書く | テストは `governance/` の外（`tests/client/`）にあるため `grep` の対象外 | 矛盾しない |
| 7 | タスク 11（実機での発火確認） | このマシンで実行できるか | できる。隔離した `HOME` で `claude -p` を走らせる |

## 裁定

- **R-19: タスク 1 の無害化は「自由文キーが存在すれば、値が `null` であってもセンチネル文字列に置換する」規則で行う。**
  根拠 — 計画書の期待値 95 を実サンプルから逆算して確かめた。**値が非空の文字列を含むファイルは 94 件**しかなく、
  95 件目は `custom_instructions` が `null` の `PreCompact` 1 件（`1789905903627876000-ev.json`）である。
  キーの存在だけで置換すれば 95 件になり、計画書の期待値と一致する。
  `custom_instructions` は `HOOK_FIELDS` に無いため、値の型が `null` から文字列に変わっても抽出の検査には影響しない。
  外れたときの損 — 無害化後の 1 ファイルで 1 つのキーの型が変わる。抽出にも流出検査にも影響しない。
- **R-20: 計画 [2] のテストは `tests/client/` に置く。`tests/fixtures/hook_inputs/` は git にコミットする。**
  `local/` の原本は git に入れない（計画書と `CLAUDE.md` のとおり）。
  外れたときの損 — なし（計画書どおり）。

---

## タスクの記録

## タスク 1〜2 の結果

| タスク | 状態 | コミット |
| --- | --- | --- |
| 1 fixture の無害化（112 件） | 完了 | `932e71a` |
| 2 `_identity.py`（識別子の解決） | 完了 | `c20b6d1` |
| レビュー指摘 I-1 / M-2 の修正 | 完了 | `19c0cb4` |

**レビュー結果:** Spec ✅。Critical なし、Important 1 件を修正 1 巡で解消。テストは 12 → **14** ケース（裁定 R-23）。

### 制御側が独立に検証したこと

**無害化（原本と突き合わせ）**

- ファイル数 112、hook 種別の内訳が計画書の期待と一致
- `grep -rl 'SENTINEL-' | wc -l` = 95（裁定 R-19 のとおり）
- トップレベルのキー構造が 112 件すべてで原本と一致（キーの増減なし）
- ホームディレクトリのパスが残るファイルは 0
- 原本の自由文 273 値を無害化後の本文と照合し、**真の流出は 0**
  （1 件の検出は `tool_input.skill` の値で、これは契約が収集する `skill_name` 列であり保持が正しい）

**I-1 の修正（変異検証）**

`Path.home()` を import 時評価に戻すと、新しく足したケースがちょうど 1 件落ちる。修正を戻すと 98 passed。

### I-1 の深刻度の実証

変異検証（修正前の状態を再現）を走らせたところ、**利用者本人の
`~/.claude/cc-governance/identity.json` が実際に作成された**（テスト値 `bar@example.com` を含む）。

```
作成時刻 04:08:08 ／ 変異検証の実行時刻 04:08:46 の直前
```

これは「修正前のコードは実ホームに書き込む」ことの直接の証拠である。
**制御側が作った残骸は削除済み。**削除後にテスト全件（98 passed）を流しても再作成されないことを確認した。
ハンドオフの「利用者本人の `~/.claude/` を書き換えない」という制約は、修正後の実装では守られている。

### 先送りした Minor（最後にまとめて判断する）

| # | 指摘 | 備考 |
| --- | --- | --- |
| M-1 | `CC_GOVERNANCE_USER_EMAIL` がある端末では hook 発火のたびに `identity.json` を上書きする | 設計書 §3.8 の「初回のみ解決してキャッシュ」の趣旨とわずかにずれる。既存キャッシュと同値なら書かない、で済む |
| M-4 | テストが `subprocess` モジュール本体の属性を差し替えている | monkeypatch が復元するので実害なし |
| M-5 | ケース 1 が「キャッシュ無し」を明示的に assert していない | 1 行で埋まる |

### 申し送り

- 状態ディレクトリの解決（`_state_dir()`）は今 `_identity.py` にある。**タスク 6 で `_queue.py` へ移す**（premises の定め）。
  移すときに `Path.home()` の遅延評価を壊さないこと
- 無害化スクリプトは `local/scripts/sanitize_fixtures.py`（git 管理外）に残してある

## タスク 3〜5 の結果

| タスク | 状態 | コミット |
| --- | --- | --- |
| 3 hook 入力からの列の抽出（`collect.py`） | 完了 | `a627c36` |
| 4 自由文が出力に現れないことの回帰テスト | 完了 | `0f027a4` |
| 5 `context_tokens` の取得（`_context.py`） | 完了 | `9b5a977` |

テストは `tests/client/` で 79 件、リポジトリ全体で 163 件。

### 制御側の外形検証

fixture 112 件を `collect.extract_event` に流し、原本の自由文と突き合わせた。

```
照合した自由文: 274 / 流出: 0
出力のキー集合は全 112 件で同一か: True
キー集合が契約と過不足なく一致: True    （kind + EXTRA_COLUMNS 7 列 + HOOK_FIELDS 12 列）
出力に SENTINEL が現れたファイル: 0
```

### 完了条件 6 と設計書 §3.4 の衝突

計画 [2] の完了条件 6 は
`grep -n 'tool_response\|"prompt"\|"message"' governance/hooks/*.py` が **0 件**であることを求めるが、
実際には 1 件ヒットする。

```
governance/hooks/_context.py:49:    message = obj.get("message")
```

**設計書 §3.4 の参照実装に、この行が literal で載っている。**

```python
u = json.loads(line).get("message", {}).get("usage") or {}
```

- **R-28: 設計書 §3.4 を優先し、完了条件 6 の `grep` は `collect.py` に限定する。**
  理由 — この検査が守りたいのは「**hook 入力の自由文に触れない**」ことである。
  `_context.py` が読むのは hook 入力ではなく **transcript ファイル**であり、
  取り出すのは `message.usage` の 3 値の**合計という数値だけ**である。
  文字列が戻り値に乗る経路が存在しない。
  完了条件の `grep` は、この 2 つを区別できない粗い道具である。設計書が仕様の正本であり、計画書はその議論にすぎない。

  **流出しないことの担保は `grep` ではなく次の 2 つに置く。**
  ① タスク 4 の 12 ケース（出力に自由文が現れないことを直接検査する）
  ② 制御側の外形検証（自由文 274 値との照合で流出 0）

  外れたときの損 — `_context.py` が将来 `message` から数値以外を取り出すように変わっても
  `grep` が気づかない。①②が実際の出力を見ているため、そちらで捕まる。

### タスク 3〜5 のレビュー結果

**Spec ❌。Critical 1 件、Important 2 件。**

#### Critical C-1: 非 str の `transcript_path` で例外が漏れ、標準出力が閉じられる

`_context.py` の `_read_tail` が `open(path, "rb")` を `except OSError` だけで囲っている。**制御側の実測:**

```
transcript_path が float → TypeError: expected str, bytes or os.PathLike object, not float
transcript_path が True  → RuntimeWarning: bool is used as a file descriptor
                           Exception ignored on flushing sys.stdout: OSError: [Errno 9] Bad file descriptor
                           終了コード 120
```

`True` は **fd 1 として開かれ、`with` を抜けるときにプロセスの標準出力が閉じられる。**
インタプリタ終了時の stdout フラッシュで**終了コードが 120** になり、入口の `try/except` では防げない。

共通制約「**hook の終了コードは常に `exit 0`。標準エラーにも出さない**」に正面から違反する。
`transcript_path` は上流の Claude Code が与える値であり、設計書 §9.1 が想定する「入力形式が変わる」経路そのもの。

#### Important C-2: テストが利用者の実 `HOME` に書き込んでいた

`test_collect_extract.py` と `test_collect_no_leak.py` が `CLAUDE_PLUGIN_DATA` を隔離しないまま
`collect.extract_event` を呼ぶため、`_identity` のキャッシュ書き込みが実ホームに届いていた。

**制御側が実測した中身:**

```
~/.claude/cc-governance/identity.json
{"user_email": "130845842+annin-total@users.noreply.github.com"}   ← 利用者の実メールアドレス
```

`~/.claude` は git リポジトリだが、このパスは `.gitignore` 済みでコミットはされない。**制御側が削除済み。**
premises「テストの隔離: `CLAUDE_PLUGIN_DATA` を一時ディレクトリに向ける」と、
ハンドオフ「利用者本人の `~/.claude/` を書き換えない」に反する。

#### Important C-3: 報告の検証主張が実際の出力と食い違っていた

報告が「`grep` は 0 件」と書いていたが実際は 1 件ヒットする（裁定 R-28 の行）。コードは適合だが、
完了条件の証拠として受け取る以上、逐語の出力に直させる。

### 裁定

- **R-29: `EXTRA_COLUMNS` の 7 列も契約の `coerce` を通す。**
  理由 — 現状は通していないため、`context_tokens` が `usage` の float をそのまま返し、`NaN` / `Infinity` が
  `json.dumps` で**非標準 JSON** として出力されうる。`hook_event`（`VARCHAR(64)`）等も桁で切り詰められない。
  設計書 §3.2 は「桁に収める責務は契約だけが持ち、受信側で再解釈しない」「`hook_event` に想定より長い値が
  1 つ来ただけで、そのリクエストのイベントがすべて失われる」と明記している。
  **計画書は `coerce` を求めていないが、設計書が求めている。**
  外れたときの損 — 正常な値に対しては何も変わらない（`day` / `ts` は int、文字列列は短い）。

### 先送りした Minor（最後にまとめて判断する）

| # | 指摘 |
| --- | --- |
| M-7 | `test_collect_extract.py` の #10 に `assert row["permission_mode"] is None or True` という常に真の行がある |
| M-8 | `test_context.py` の #21 が `assert result is None or isinstance(result, int)` で実質何も固定していない |
| M-9 | `test_collect_extract.py` が 349 行で「1 ファイル 200 行以内を目安」を超える（brief が 30 ケースを表で指定しているため妥当な結果ではある） |

## タスク 3〜5 の修正の再レビュー

**C-1 / C-2 / C-3 / R-29 はすべて ADDRESSED。** レビュアは目視ではなく、`print` を含む子プロセスを 10 種類の
`transcript_path` で実行し（fd 1 が閉じていれば必ず失敗する形）、**全件が終了コード 0・標準エラー空・戻り値 `None`** で
あることを確認した。修正前のコードを取り出して `rc=120` も再現している。
`HOME` を空の一時ディレクトリに差し替えて全件走らせ、**書き込みが 1 つも無い**ことも確認済み。

`pathlib.Path` を渡すと `None` が返る（弾かれる）。`_context.context_tokens` の型註記は `Optional[str]` で、
実運用では JSON 由来の値しか渡らないため brief の想定どおり。**将来 `_queue.py` から `Path` で呼ぶと静かに欠測する**点は申し送り。

### 再レビューが見つけた新しい問題（制御側が実測で確認）

**L-1（流出の経路。この設計の中核の約束に関わる）**

`contract.py` の `_coerce_varchar` が `str(value)` で dict をそのまま文字列化するため、
**上流が契約のキーパス先の型を変えると、自由文が 255 文字まで収集される。**

```
tool_input={"skill":{"prompt":"SENTINEL-秘密の本文がここに入る-abcdef"}}
  → skill_name = "{'prompt': 'SENTINEL-秘密の本文がここに入る-abcdef'}"
effort={"level":{"note":"SENTINEL-2-機密"}}
  → effort_level = "{'note': 'SENTINEL-2-機密'}"
```

設計書 §9.1 が想定する「**入力形式が変わる**」経路そのものである。
タスク 4 の回帰テストも fixture 照合も、fixture の `skill` が文字列であるためこの形を張っていない。

**L-2（契約に列を足すと hook が落ちる）**

`collect.py` が `EXTRA_COLUMNS` の列名を `raw_extra[name]` の添字で引いている。

```
collect.EXTRA_COLUMNS += (("plugin_version","VARCHAR(32)"),)
  → KeyError: 'plugin_version'
```

**計画 [3] は実際に `plugin_version` を足す。** 契約は複数の計画が共有する正本であり、現実に増える側の定数である。

### 裁定

- **R-32: `_coerce_varchar` はスカラ以外（dict / list）を `None` にする。**
  理由 — 「収集は最小限にする。契約が名指ししたものだけを読む。本文には触れない」はこの設計の中核の約束であり、
  上流の型変更で破れてはならない。`str(dict)` は「名指ししたキーパスの値」ではなく「その中身全部」を載せる。
  外れたときの損 — 上流が値を dict にした列が `None` になり欠測する。**自由文を載せるよりはるかに良い。**
- **R-33: `collect.py` は `raw_extra.get(name)` で引く。** 契約に列が増えても `None` で埋まる形にする。
  外れたときの損 — なし。

### 契約の変更をどのブランチで行うか

`contract.py` は計画 [1] の成果物だが、`feat/server-ingest` で既に 2 つの修正が入っている
（R-30 の 64bit 範囲検査、R-31 の符号化できない文字の置換）。**同じ関数を 2 つのブランチで編集すると衝突する。**

- **R-34: 契約の修正はすべて `feat/server-ingest` に集約し、そこから `feat/client-collection` へ cherry-pick で伝播させる。**
  理由 — 契約は正本 1 か所であり、枝分かれした状態を長く保たない。
  外れたときの損 — cherry-pick の分だけ履歴が重複する。突き合わせ時に解消する。

### 先送りした Minor（追加）

| # | 指摘 |
| --- | --- |
| M-10 | R-29 の振る舞い（`NaN` / `Infinity` / float が `None` になる）を固定するテストが無い |
| M-11 | C-1 の parametrize が `list` / `dict` を含んでいない（実測ではどちらも安全） |
| M-12 | サロゲートを含む文字列が `coerce` を素通りして行に載る。`json.dumps(ensure_ascii=False)` で書き出すと例外になる。**`_queue.py`（タスク 6）の書き出し方で判断が要る** |

## タスク 6〜7 の結果

**219 passed**（既存 177 + 22 + 20）。レビュー結果は **Spec ✅ / Approved**、Critical なし。

### レビュアが実測で確認したこと

- **`_state_dir()` の遅延評価**：`HOME` を import 後に差し替えても追従。`_identity._state_dir is _queue._state_dir` が `True`
- **`_sender.py` が例外を漏らさない**：実物をコピーしたツリーで**別プロセスとして 12 通り**起動し、
  全件 `rc=0` / stderr 空 / ファイル残存（config 欠落・壊れた JSON・不正な URL・存在しないホスト・型の壊れた設定値）
- **実 detach**：3 秒かけて応答する HTTP サーバを立てて `launch()` を呼び、
  `launch()` の戻りが 0.008 秒（待たない）、子プロセスが別セッション、spool が空になり受信 2 件を確認
- **冪等性の検査が本物**：時刻を固定して `rotate` を 2 回 → UUID が無ければ 1 ファイルに上書きされて落ちる形になっている
- **「古い順」の破棄が本物**：最古の名前が消えていること **かつ** 残り 5 件を主張している

### 制御側の独立検証

`ensure_ascii=True` の選択が正しいことを実測した。

```
ensure_ascii=True  : 孤立サロゲートを含む行の追記が成功し、読み戻しも一致
ensure_ascii=False : write の段で UnicodeEncodeError
                     （json.dumps 自体は通るため見落としやすい経路）
```

### モジュール名が標準ライブラリと衝突していた

**`governance/hooks/_queue.py` は CPython の標準ライブラリ `_queue`（`queue` モジュールの C 実装）と同名である。**

制御側の実測:

```
import queue した時点で sys.modules['_queue'] が配布物の _queue.py になる
queue.SimpleQueue が queue._PySimpleQueue（純 Python 実装）へ静かに降格する

builtin は sys.path[0] より優先される（実証済み）
→ _queue が sys.builtin_module_names に入るビルドでは、配布した _queue.py が読まれず、
  _sender.py の _queue.rotate が AttributeError になり、except に飲まれて無言で何もしない
```

手元の 3 種の Python（3.9.6 / 3.13 / 3.14）はいずれも `_queue` が共有拡張のため、この環境では起きない。
しかし**端末の Python の版・ビルドを選べない**（premises）以上、配布物が標準ライブラリ名を覆うのは避けたい。
失敗の形が「無言で送信が止まる」であり、フェイルオープンで気づきにくい。

- **R-38: `_queue.py` を `_spool.py` に改名する（利用者の承認済み）。**
  外部の振る舞い（hook 登録・契約）は変わらない。spool を扱うモジュールなので名前としても適切である。
  **設計書 §3.1 のファイル一覧と計画 [3] の記述とはずれる。設計書は変更しない（利用者の指示）。**
  外れたときの損 — ドキュメントとコードでファイル名が食い違う。この台帳が説明になる。

### 先送りした Minor

| # | 指摘 |
| --- | --- |
| M-13 | `append` が毎回 `mkdir(exist_ok=True)` を呼ぶため、同期 I/O が「追記 1 回」より多い。計画書のケース 6 が要求しているため仕様どおり |
| M-14 | `should_send` が 3 回 stat する。`os.stat` 1 回 + `FileNotFoundError` 分岐で 2 回に減る |
| M-15 | `except (urllib.error.URLError, OSError)` の `URLError` は `OSError` の派生で冗長 |
| M-16 | `mark_sent` を既存ファイルがある状態で呼ぶケースが無い（本番で支配的なのはこちら） |
| M-17 | 「終了コード 0」を別プロセスで確認するテストが無い（レビュアが 12 通り実測済み） |

### 申し送り

**`mark_sent()` を呼ぶ経路がまだ無い。** `_sender.run()` は `rotate` → `prune` → POST しか行わない。
**タスク 8 の結線で hook 側が `mark_sent()` を呼ばないと `should_send()` が常に真になり、毎 hook で `launch()` が走る。**

## タスク 8〜9 と改名の結果

**254 passed**（`tests/client/` は 161）。

### 制御側の独立検証

**改名の効果:**

```
sys.modules['_queue'] = 標準ライブラリの共有拡張のまま
queue.SimpleQueue     = <class '_queue.SimpleQueue'>   ← C 実装に戻った
governance/hooks/ : _spool.py があり _queue.py は無い
```

**実物の `collect.py` を子プロセスで叩いた結果（8 種類の壊れた入力）:**

```
rc=0 / 出力 0 バイト : 正常な JSON / {} / 非 JSON / 配列 /
                       transcript_path が true / 同 1.5 / session_id が dict・effort が配列 / 空入力
CC_GOVERNANCE_DISABLE=1 : rc=0、queue.jsonl に行が増えない
queue.jsonl : 8 行。kind / event_id / ts / day / user_email / host / hook_event / context_tokens が入っている
```

**「hook の終了コードは常に `exit 0`。標準エラーにも出さない」が、実物のプロセスで成立している。**

### 計画書のテスト件数について

計画書が書く件数（タスク 9 の「154 passed」など）は**計画書時点の静的見積り**であり、
レビュー対応による積み増し（R-23 / R-29 / R-32 / R-38 など）で実測とずれている。
**「既存を 1 件も壊さない」を実測で満たしていることをもって代える。**

### タスク 8〜9 のレビュー結果

**Spec ✅ / Approved。Critical・Important なし。** ただし Minor のうち 3 件は実害があり、制御側が実測で確認して裁定した。

レビュアが評価した点:

- **`mark_sent()` → `launch()` の順序が、detach 方式における唯一正しい選択である。**
  `launch()` の後に呼ぶと `Popen` と `mark_sent()` の間に別セッションが `should_send()` を真と読む窓が残る。
  `_sender` 側で呼ぶとさらに悪い（子プロセスの起動から到達まで数十〜数百 ms あり、その間に他セッションが一斉に起動する）
- 「送信が失敗しても `sent_at` が更新される」のは**設計の意図と整合する**。
  `sent_at` を送信成否に連動させると、サーバ停止中に全端末が毎 hook で送信プロセスを起こす
- 改名は完全。`_queue` のモジュール参照は 0 件（残る `_queue_path()` は状態ファイル `queue.jsonl` に由来する正当な語）
- タスク 9 の変異検証をレビュアが自分で逐語再現した

### 裁定（制御側が実測で確認）

- **R-42: hook 実行中の `SIGINT` でトレースバックが出るのを止める。**

  **制御側の実測:**

  ```
  SIGINT@0.005s : rc=-2 stderr=0バイト      ← 起動中。Python 側では防げない
  SIGINT@0.02s  : rc=-2 stderr=792バイト    ← KeyboardInterrupt のトレースバック
  SIGINT@0.04s  : rc=-2 stderr=749バイト
  SIGINT@0.07s  : rc=-2 stderr=751バイト
  ```

  共通制約は「**hook の終了コードは常に `exit 0`。標準エラーにも出さない**」、
  計画 [2] の完了条件 11 は「**実機で利用者の画面が汚れない**」である。
  **利用者が Ctrl+C で中断したとき、hook のトレースバックが画面に出る。**
  hook は 0.08 秒走るので窓は実在する。

  `except Exception` を `except BaseException` に広げる。
  **インタプリタ起動中の SIGINT は Python 側では捕まえられない**（上の 0.005s の行）が、
  その窓では標準エラーも空なので画面は汚れない。**塞げる範囲を塞ぐ。**
  外れたときの損 — hook が SIGINT を飲み込む。0.08 秒の短命プロセスであり、Claude Code 本体の中断処理とは独立。

- **R-43: `import _sender` を無効化の判定より後ろへ遅延させる。**

  **制御側の実測:**

  ```
  import time: 439 | 42412 | _sender        ← うち urllib.request 33ms、ssl 4.7ms
  hook の実行時間 : 0.08 秒（素の python 起動は 0.02 秒）
  ```

  設計書 §3.9 は「冒頭で判定し、即 `exit 0`」と定めるが、実際は `import _sender`（モジュール先頭）が
  `urllib.request` / `ssl` を引き込んだ**後**に判定している。
  **`_sender` を使うのは `Stop` と `SessionStart` だけである。**
  `PostToolUse` は毎ツール実行で走るのに、そこで決して使わない import の代を毎回払っている。
  外れたときの損 — なし（import の位置だけ）。

- **R-44: タスク 9 のテストに「収集が成立すべきケースで `queue.jsonl` が 1 行増える」主張を足す。**

  理由 — レビュアの検証により、**`main()` が空の `collect.py` でも 20 件が GREEN になる**ことが分かった。
  「hook が何もしなくても合格する」スイートである。単独変異では鳴らず、二重変異でしか鳴らない。
  計画 [1] の R-13、計画 [8-A] の R-22 と同じ理由づけであり、一貫させる。
  外れたときの損 — なし（テストの強化のみ）。

### 先送りした Minor（追加）

| # | 指摘 |
| --- | --- |
| M-18 | `collect.py` の `hook_event` の型注釈が `str` だが `None` を渡す経路がある。`Optional[str]` が正しい（R-42 の修正に同梱する） |
| M-19 | `mark_sent()` の `mkdir` が冗長（`should_send()` が真＝親ディレクトリは存在する） |
| M-20 | テストファイルが 200 行の目安を超える（248 / 285 行）。fixture が 2 ファイルで重複している |
