# 計画 [3] 端末：設定の自動適用とお知らせ — 実装台帳

**ブランチ:** `feat/client-policy-notices`（`feat/client-collection` から分岐）
**計画:** `docs/plans/03-client-policy-notices.md`

## 着手前の矛盾走査

| # | 走査した対象 | 突き合わせたもの | 結果 |
| --- | --- | --- | --- |
| 1 | タスク 1 の完了判定 `154 passed` | [2] 完了時点の `tests/client/` の実績 | **不一致。**[2] は 162 passed で終わっている（R-42〜R-44 のテストが加わったため）→ 裁定 R-45 |
| 2 | タスク 7 が名指しする `_queue` | [2] の実体 | **不一致。**R-38 で `_spool.py` に改名済み → 裁定 R-46 |
| 3 | タスク 11-8「送信は止まらない」 | `collect.main()` の無効化の実装 | **矛盾。**`main()` は `CC_GOVERNANCE_DISABLE` で送信判定ごと return する → 裁定 R-47 |
| 4 | タスク 7 の `plugin_version` | `contract.POLICY_COLUMNS` | 一致（`plugin_version VARCHAR(32)` が既にある） |
| 5 | タスク 3〜4 の `POLICY` 2 項目 | `contract.POLICY` | 一致（`env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` = `"60"`、`…autoUpdate` = `True`） |
| 6 | タスク 12 の `hooks.json` 7 種 | [2] が置いた 6 種 | 一致（`SessionStart` の 1 ブロックを足すと 7 になる） |
| 7 | タスク 12 の実機確認 | [2] タスク 11 の状況 | **同じ壁。**隔離 HOME での `claude` 起動に利用者の実アカウントでの OAuth 認可が要る → 裁定 R-48 |
| 8 | タスク 8〜9 の `seen.json` の置き場所 | `_spool._state_dir()` | 一致（`CLAUDE_PLUGIN_DATA`、無ければ `~/.claude/cc-governance/`）。この計画で別の規則を作らない |
| 9 | タスク 4 の一時ファイルと [2] の書き込み作法 | `_identity._save_cache()` | **走査が誤り。**`_save_cache()` は tempfile を使わず `open(path,"w")` で直接書いている → 裁定 R-49 |
| 10 | タスク 9 の標準出力 JSON | `collect.py` が標準出力に何も出さないこと | 競合なし（`collect.py` は出力しない。出すのは `session_start.py` だけ） |

## 裁定

**R-45: タスク 1 の完了判定 `154 passed` は「退行なし」と読み替える。**
理由: [2] の実績が 162 であり、154 は計画執筆時点の見込み。土台を置くタスクで件数が減らないことが趣旨である。
外れたときの損: 件数のずれを見逃し、[2] のテストが静かに 8 件消えても気づかない。→ 基準値 162 を台帳に明記して固定する。

**R-46: タスク 7 の `_queue` は `_spool` と読み替える。**
理由: R-38 で標準ライブラリ `_queue` との衝突を避けて改名済み。計画は改名前に書かれている。
外れたときの損: `import _queue` が標準ライブラリを掴み、キューに 1 行も積まれないまま成功したように見える。

**R-47: `session_start.py` は `collect.main()` を呼ばない。収集部分を直接組み立て、送信条件の判定を無効化スイッチの外側に置く。**
理由: タスク 11-8 は「`CC_GOVERNANCE_DISABLE` でも送信プロセスが 1 回起動する」を要求する。`collect.main()` は
スイッチが立っていると送信判定に到達せずに return するため、委譲すると 11-8 を満たせない。設計書 §3.9 の趣旨は
「止めるのは利用ログの収集とお知らせの表示であって、ガバナンスとその記録の伝達ではない」であり、
policy イベントを積んだうえで送らないのは、その端末がサーバから静かに消えることと同義である。
外れたときの損: 無効化した端末の policy イベントが端末に溜まり続け、準拠率の分母から消えて施策の効果が実態より良く見える。

**R-48: タスク 12 は `hooks.json` への `SessionStart` 登録までを行い、手順 1〜6 の実機確認は保留する。**
理由: [2] タスク 11 と同じ認可の壁（隔離 HOME での `claude` 起動に利用者の実アカウントでの OAuth 認可が要る）。
利用者の判断を待つ事項であり、勝手に認可しない。
外れたときの損: 完了条件 15〜18（本人の設定ファイルが不変・2 回目の `prev_value` が `"60"`・`systemMessage` の
接頭辞と 600 字・`extraKnownMarketplaces` が作られない）が未検証のまま残る。**台帳と PR に未検証と明記する。**

## 基準値

| 対象 | 着手時点 |
| --- | --- |
| `pytest -q tests/client` | 162 passed |
| `pytest -q`（全体） | 255 passed |

## レビューの指摘と対応（タスク 1〜6）

Critical 1 件・Important 4 件・Minor 6 件。採った 6 件はいずれも監督役が独立に実測で再現してから直した。

| 記号 | 内容 | 実測した故障 | 対応 |
| --- | --- | --- | --- |
| C-1 | `_load()` が `UnicodeDecodeError` を捕まえない | 非 UTF-8（CP932 の日本語など）を含む `settings.json` で**例外が `apply_settings()` の外へ漏れる**。SessionStart のたびに落ち、お知らせも policy イベントも到達せず、その端末が準拠率の分母から静かに消える | `except (OSError, ValueError)` に広げる |
| C-1b | 深い入れ子の JSON が `RecursionError` を投げる（`ValueError` 派生ではない） | 同上 | `except (ValueError, RecursionError)` |
| I-1 | `os.replace` がシンボリックリンク**そのもの**を置き換える | `settings.json → real.json` のリンクが**普通のファイルに化け、実体は `{}` のまま取り残される**。しかも `apply_result` は `applied`。dotfiles 管理（stow / chezmoi）の端末が沈黙して壊れる | 書き込み前に `Path.resolve()` でリンクを解決し、実体に書く |
| I-2 | 一時ファイルを同じディレクトリに作る制約にテストが無い | `dir=` を外す変異で 49 件が全通過（**変異生存**）。ホームが別ファイルシステムの端末でクロスデバイスとなり、恒久的に `write_failed` | `mkstemp` の `dir` を検査するテストを足す |
| I-4 | 計画書 2-7（`{"env":"proxy"}`）が戻り値しか縛っていない | `_container_ok` の `isinstance` 検査を落としても 2-7 は通る | ファイルのバイト列と `st_mtime_ns` の不変まで縛る |
| M-1 | `_equal_strict` に検査が無い | Python では `1 == True` が真。素の `==` に戻すと、`autoUpdate` が整数 `1` の端末を準拠済みと誤認し、JSON 上は `true` でない値が残り続ける | 整数 `1` で `applied` になることを縛る |

**6 件とも変異検査で確認した。** 修正を 1 つずつ戻すと、対応するテストがちょうど 1 件ずつ落ちる。

**ただし 1 回目の変異検査で `RecursionError` のテストだけが生き残った。** 入れ子を `[` で作っていたため、
`RecursionError` を捕まえていなくても `isinstance(data, dict)` の検査で先に `parse_failed` になっていた。
**テストは通っていたが、理由が違った。** 入れ子を dict に直して再検査し、落ちることを確かめた。

### 裁定

**R-49: 走査 #9 の記述を訂正する。`_settings.py` は `_identity._save_cache()` に揃えない。**
`_save_cache()` は `open(path,"w")` で直接書いており、tempfile + `os.replace` の作法は実装されていない。
`identity.json` は失われても再構築できるキャッシュだが、`settings.json` は再構築できない利用者の資産であり、
要求水準が違う。計画書本文が明記する「同じディレクトリに一時ファイル → `os.replace`」に従う。
外れたときの損: 書き込み中に電源が落ちると、利用者の `settings.json` が切れた JSON になる。

**R-50: シンボリックリンクは解決して実体に書く。**
設計書にも計画書にも記述が無い抜けであり、裁定する。dotfiles 管理下の端末はリンク先に書かれることを
期待しており、リンクを実ファイルに置き換えるのは利用者の管理構成の破壊である。
外れたときの損: リンクの向き先が利用者の意図と違った場合、意図しないファイルを書き換える。
ただしリンクを張ったのは利用者自身であり、リンクを黙って壊すより害が小さい。

### 採らなかったもの

M-2（`RecursionError`）は C-1b として採った。M-3（`os.replace` でモードが 0644→0600。厳しくなる方向で実害なし）、
M-4（5-1〜5-5 が `tempfile.mkstemp` の呼び出しに結合していて脆い。現時点で偽陽性は出ていない）、
M-6（`__pycache__` に改名前の `_queue.cpython-313.pyc` が残る。gitignore 済みだが [7] の配布検査で掃除する）は採らない。

### 計画書の完了判定コマンドの件数について

`-k` の部分一致のため、計画書の件数と実測が合わない（`-k read` 期待 8 → 実測 19、`-k already_ok` 7 → 9、
`-k apply` 15 → 16、タスク 5 の「40 passed」はタスク 6 の 9 本を含まない数）。
**ケース番号は 2-1〜2-8 / 3-1〜3-7 / 4-1〜4-15 / 5-1〜5-10 / 6-1〜6-9 の 49 本すべてが 1 対 1 で実装されており、欠番は無い。**
計画書側の数字の誤りであり、実装の欠陥ではない。設計書は触らない指示のため、ここに記録するにとどめる。

## タスク 7〜12 完了とレビュー指摘の対応

Critical 1 件・Important 2 件・Minor 3 件の指摘に対応した。**I-1・M-1 は先に落ちるテストを書き、
実際に落ちることを確認したうえで直した。すべての修正を変異検査で確認している**（後述）。

| 記号 | 内容 | 実測した故障 | 対応 |
| --- | --- | --- | --- |
| I-1 | 標準出力のパイプの読み口が閉じていると exit 120 + 標準エラーに出力 | 実測: `rc=120` / `stderr` に `"Exception ignored on flushing sys.stdout:\nBrokenPipeError: [Errno 32] Broken pipe"`。`_emit_output` は `write`/`flush` の例外を捕まえるが、`TextIOWrapper` 内部の `BufferedWriter` に残った書き込み済みデータがインタプリタ終了時の最終 flush で再送され、そこで再び失敗する | `_emit_output` の例外処理で `os.dup2(os.open(os.devnull, os.O_WRONLY), 1)` を行い、fd 1 を `/dev/null` に差し替える |
| I-2 | 「flush が例外なく終わってから既読」が未テスト | `write` しか失敗させない `_RaisingStdout` では、flush だけが失敗する経路を検査できていなかった | `flush` だけが例外を投げる `_FlushRaisingStdout` を追加し、`seen.json` が更新されないことを縛るテストを足した |
| I-3 | `_read_stdin_json()` と `_identity.get_plugin_version()` が 3 ステップの try の外にあり、そこで落ちると完全に無言で終わる | 深い入れ子の標準入力による `RecursionError` を模した monkeypatch で、`settings.json` 未作成・`queue.jsonl` 0 行・標準出力空で exit 0 になることを確認 | `plugin_version` の取得を `_apply_settings_step` の中へ、標準入力の読み取りを `_collect_step` の中へ移した |
| M-1 | `notices.json` の 1 項目が壊れていると正常な項目まで全部出なくなる | `title` が無く `body` が非文字列（`int`）の項目が 1 件混ざると `_format_message` で `TypeError` になり、同じファイルの正常な項目（`n-ok`）も出力から消えることを確認 | `_read_notices`（→ `_notices.py`）の絞り込みに `body` の型検査を追加し、壊れた項目だけを飛ばすようにした |
| M-2 | 209 行を分割する | — | お知らせ一式（`_seen_path` 〜 `_write_seen` / `_format_message` / `notices_step`）を `governance/hooks/_notices.py`（99 行）へ切り出した。`session_start.py` は 209 行 → 160 行。`hooks.json` の登録（`session_start.py` が入口）は変更していない |
| M-3 | 台帳の追記 | — | 本節 |

**I-1・M-1・I-3 の 3 件は、修正前に落ちるテストで実測してから直し、修正を戻すと対応するテストがちょうど落ちることを変異検査で確認した。** 詳細は監督役への報告（`plan03-fix-report.md`）に記録する。

### タスク 12（実機確認）は依然未実施

**裁定 R-48 が自ら約束した「タスク 12 の実機確認（手順 1〜6）は未実施であり、完了条件 15〜18 が未検証である」ことを、この修正作業でも解消していない。**
`hooks.json` への `SessionStart` 登録は完了しているが、隔離 HOME での `claude` 起動に利用者の実アカウントでの OAuth 認可が要る壁は変わっておらず、次の完了条件は依然未検証のままである。

- 完了条件 15: 本人の設定ファイルが不変であること
- 完了条件 16: 2 回目の `prev_value` が `"60"` になること
- 完了条件 17: `systemMessage` の接頭辞と 600 字の目安
- 完了条件 18: `extraKnownMarketplaces` が作られないこと

### 監督役が実機で確認した事実（記録）

- **`SessionStart:<source> says: ` の接頭辞は Claude Code 本体が自動付与する。** リポジトリの実セッション画面ログ `../../../../tests/cc-test-session-1.txt` に `SessionStart:startup says: [ガバナンス] ...` が実在する。実装者の前提（コード側で接頭辞を組み立てない）は正しい。
- **`CLAUDE_CONFIG_DIR` による隔離は実機で効く。** 隔離側の `claude plugin marketplace list` は「No marketplaces configured」を返し、本人の登録が 1 件も映らないことを確認した。`claude plugin` サブコマンドはログインなしで動く。

## タスク 12: 実機での発火確認（2026-09-22 実施・全条件合格）

### 実施方法

計画 [2] の裁定 R-51 と同じ理由（macOS では `HOME` を差し替えると login Keychain が
`$HOME/Library/Keychains/` に解決されて存在せず、Keychain が書き込み不可になって認証が定着しない）により、
**隔離した `CLAUDE_CONFIG_DIR` で実施した。**計画書 §2 が第一候補として挙げている方法であり、
`CLAUDE_CONFIG_DIR` が実機で効くことは事前に確認済み（隔離側の `claude plugin marketplace list` が
「No marketplaces configured」を返し、本人の登録が 1 件も映らない）。

`session_start.py` は `settings.json` を**書く**ため、実 config ディレクトリでは決して実行しない。
`_settings_path()` が `CLAUDE_CONFIG_DIR` を最優先し、`Path.home()` が関数の中でしか評価されないことを
コードで確認したうえで実施した。

### 手順 4 の結果は計画書の期待出力と完全に一致した

```
env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE None applied
extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate None skipped_missing
env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE '60' already_ok
extraKnownMarketplaces.cc-marketplace-governance-bmsd.autoUpdate None skipped_missing
```

### 完了条件

| # | 条件 | 結果 |
| --- | --- | --- |
| 15 | 隔離環境の設定ファイルだけが書き換わり、本人のものは不変 | **合格。**指紋が作業前後で一致。`~/.claude` 全体を走査して新実装の痕跡 0 件 |
| 16 | 2 回目の起動で `prev_value` が `"60"` になる | **合格** |
| 17 | `systemMessage` が `SessionStart:<source> says: ` の接頭辞つきで表示され、日本語 600 字の文面が退避されない。未読 2 件が空行 1 つ区切りの 1 つのメッセージになる | **合格**（下記） |
| 18 | `extraKnownMarketplaces` が作られず `skipped_missing` が記録される | **合格** |
| 手順 6 | 既に別の値（`95`）を持つ端末 | **合格。**`prev_value` が `"95"`・`apply_result` が `applied` になり、`model` / `permissions` / 他のマーケットプレイスのエントリ / 両方の `source` がすべて保たれ、一時ファイルも残らない |
| — | 既存キーの保全 | **合格**（`theme: dark` が保たれた） |
| — | 画面が汚れない | **合格**（`Traceback` 等の検出 0 件） |
| — | `SessionStart` が実機で発火する | **合格。**1 起動につき policy イベントが 2 行（`POLICY` の項目数）積まれる |

### 完了条件 17 の実測

短い文面（27 字）と長い文面（614 字）の 2 件を未読にして対話起動した。観測されたこと:

- **`SessionStart:startup says: ` の接頭辞が付く**
- **接頭辞が付くのは 1 行目だけ**である
- **2 件が空行 1 つで区切られた 1 つのメッセージ**として出る。`systemMessage` が 2 回に分かれない
- **614 字の文面はファイルへ退避されず、そのまま画面に出る**

退避された場合の表示は `SessionStart:startup says: <persisted-output>` の形になる。今回はその形にならなかった。
**設計書が置いた「お知らせ 1 件は目安として日本語 600 字程度まで」という目安は、実機で妥当である。**

hook を直接叩いた検査でも、出力のキーが `systemMessage` の 1 つだけ（`additionalContext` を含まない）、
値が 1 つの文字列、`\n\n` の出現が 1 回であることを確認した。

### 裁定 R-48 の解消

R-48 は「タスク 12 は `hooks.json` への登録までを行い、手順 1〜6 の実機確認は保留する」としていたが、
`CLAUDE_CONFIG_DIR` 方式への切り替えにより**全手順を実施し、完了条件 15〜18 をすべて満たした。**
未検証事項は残っていない。
