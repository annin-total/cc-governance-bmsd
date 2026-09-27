# D1 設定の配布と端末の状態 の精査

## 1. 結論（5 行以内）
- 報告書の D1 部分は notes と今のコードにおおむね一致する。3.9 の行番号も、1 か所を除いて正しい。
- 最大の誤りは 4.1 の P1「`test_policy_schema.py` に型の検査を足す」である。上流のスキーマで適用結果を検証するテストは、`tests/plugin/test_policy_schema.py:57-68` に既にある。要るのは「新設」ではなく、壊した `policy.py` でこのテストが落ちるかを確かめる変異検査である。
- 報告書は 3.1（配った型違いで全停止）の復旧手順を落としている。`release.md` 10 章にも無い。リリース前に文書で補う価値が最も高い。
- 3.9 の一部は既に仕様か判断で決まっていることで、不具合候補ではない（ONCE の上書き・UC 24 の既読）。宙づりのリンクは、導入どおりの状態では到達しない。これらは格下げか注記が要る。
- 報告書の改善案から、SystemExit の保護・BOM・書き戻しによる 2 MiB 超え・利用者向けの撤去手順が落ちている。

## 2. 発見の検証
| 発見 | UC | 判定 | 根拠（ファイル:行） | 報告書の要修正点 |
| --- | --- | --- | --- | --- |
| 型違いの値 1 つで本体が settings.json を読み捨て、hook が全停止する。直した版も届かない | 01・13 | 裏付けあり（notes の実測） | uc-01 notes 55-59・87-142。コードは関与しない | 「防げるのは配る前の検査だけ」は正しい。ただし、その検査は既にある（下の行）ことを書く |
| P1: `test_policy_schema.py` で SET・ONCE の値を型表で検査する | 01・12 | 一部誤り | `tests/plugin/test_policy_schema.py:1-4,57-68`（schemastore のスキーマを 2026-09-25 に取得し、`policy.py` の適用結果を検証する）。読み取り専用で確かめた: この validator は `cleanupPeriodDays:"30"`・`env:"broken"` を拒否する。set の値は `_settings.py:69` の `TypeError` でテストが例外になる | 4.1 の P1 を「既存のテストが壊した `policy.py` で落ちることを変異で確かめる」に改める。P1 の件数（1 章 9 項）も直す |
| `_write` で JSON に書けない値のとき `.settings-*.tmp` が残る | 12 | 裏付けあり | `_settings.py:60-69,82`（`except OSError` だけ） | 上の既存テストが set の値を止めるので、実害はテストを流さないリリースに限られる。P2→P3 が妥当 |
| `SystemExit` は全段を無言で止める | 12 | 一部誤り（言い過ぎ） | `session_start.py:123-132` の identity と statusline は実行済み。`:134-137` を素通りし、`:159-162` で飲まれる | 「全段」を「設定の適用より後の段（お知らせ・収集・送信）」に直す。notes の改善案（1 行で保護を広げる）が 4.1 から落ちている |
| バックアップを置換の前に取るので、置換が失敗するたびに増える | 13 | 裏付けあり | `_settings.py:76-80`・`_govdir.py:62` | 無し。同じ機構が A3 でも増える（下）ので、1 つの対策（直前のバックアップと同じ内容なら取らない）でまとめて直せる |
| `mkstemp` の 0600 で置き換えるので元の権限が失われる | 13 | 裏付けあり | `_settings.py:60,80` | 0600 はバックアップと同じ方針（`_govdir.py:16-17`、env にトークンが入りうる）で、害は小さい。実害があるのは 0444 を上書きする方。P2→P3。「書き込みビットが無ければ書かない」を主案にする |
| 宙づりのリンクの先に `mkdir(parents=True)` でファイルを作る | 13 | 裏付けあり・条件の書き漏れ | `_settings.py:38-46,59` | 本体は宙づりのリンクを読まないので、導入どおり（`enabledPlugins` が user だけ）では hook が動かず到達しない。notes の表の「proj ありなら」を報告書が落としている |
| ADD と REMOVE が重なると毎セッション書き込み・バックアップを行う | 06 | 裏付けあり | `_policy_ops.py:146-152`・`_settings.py:103-105` | 仕様 `spec/plugin.md:89`「差分が無ければ書かない」に反することを書き足す（仕様との不整合として扱う） |
| ONCE の記録は今の組だけを持ち、前の値へ戻すと利用者の値を上書きする | 06 | 事実は裏付けあり。分類は誤り | `_settings.py:110-116`、仕様 `spec/plugin.md:85`「値を変えて配れば再度 1 回書く」 | 3.9 の「不具合候補」から外し、仕様の明記（文書）に回す |
| 検査から置換までの窓に入った他者の書き込みは消える | 14 | 裏付けあり | `_settings.py:72-80` | 無し（P3 で妥当） |
| `save_once` が非原子的・`sync_statusline` の一時ファイル名が固定 | 14 | 裏付けあり（観測はされていない） | `_govdir.py:84,107` | `_notices._write_seen`（`_notices.py:58-66`、`open("w")`）も同じ形。まとめて書くとよい |
| `-p` でも `claude-vscode`・未知の値を継いだら既読にする | 24 | 裏付けあり。扱いの誤り | `session_start.py:78-79`・`_browser.py:17-19` | 報告書の `session_start.py:75` は `:78-79` の誤り。この代償は `decisions/plugin.md:83-84` で判断済み（「非対話に含めると既読にならず出続ける」）。4.1 の P3「許可リストにするか判断」は蒸し返しにあたる。knowledge の追記だけにする |
| `"0"` も無効化になる。無効化中は積まないので、再開後に漏れない | 41 | 裏付けあり | `session_start.py:3,111-113,120` | 無し |
| uninstall は未送信の queue・spool を消す。statusLine と配った値は残る。`governance/` を消すと ONCE が上書きする | 60 | 裏付けあり | `knowledge/claude-code-behavior.md:10`（data の削除）・`spec/plugin.md:106` | 利用者向けの撤去手順（notes の 4 項）と、statusline の `MODULE_NOT_FOUND` が 4 章から落ちている |
| BOM 付き・Latin-1 は本体が読み、プラグインは parse_failed になる | 13 | 裏付けあり | `_settings.py:18-24` | 3.1 に事実はあるが、改善案（`utf-8-sig`）が落ちている |
| 同時起動でも settings.json は壊れない。20 本以上の一斉起動で cancelled | 14 | 裏付けあり | uc-14 notes の本番の表 | 無し |

## 3. 取りこぼし
- **型違いを配ったときの復旧手順が、どこにも無い**（報告書・`release.md:127-133`）。notes（uc-01 125-136）には手順がある。(1) 直した版を先に出す。(2) 利用者が `claude doctor` の `Invalid settings` で名指しされたキーの型を直すか、キーを消す。順序を誤ると、旧版の hook が再開して同じ値を書き直し、再び止まる（推論）。
- **読み捨ての間は自動更新も止まりうる（推定・未確認）。**`autoUpdate` の権威は settings.json の `extraKnownMarketplaces`（`knowledge/claude-code-behavior.md:17`）で、ファイルごと読み捨てられるためである。R4 は手動の `plugin update` で確かめただけである。
- **schemastore と上流の検証は一致しない（事実）。**`env` の値に int の 60 を入れると、schemastore は拒否し（上の読み取りで確認）、本体 2.1.283 は受け付ける（uc-01 notes 68）。逆向き、つまり schemastore が通して上流が捨てる値があるかは未確認である。既存のゲートの残るリスクはここにある。
- **hook の書き戻しが、本体の 2 MiB の上限を自分で越えうる（推論）。**書き戻しは `indent=2`（`_settings.py:69`）で、5000 段の入れ子は 10 KB から 50 MB に膨らんだ（uc-13）。本体は 2 MiB を超える settings.json を捨てるので、その後はプラグインが自分で止まり、戻れない。病的な入力だが、機構は 3.1 と同じである。
- `SystemExit` の保護（uc-12 notes の改善案、1 行）が 4 章に無い。
- UC 13 の R4 以外に、`parse_failed` の行が実際に届くのは BOM 付きと Latin-1 のときだけである。サーバで parse_failed が 0 件でも、壊れた端末が無いとは言えない（監視の読み方）。

## 4. 改善案
| ID | 観点 | 内容 | 優先度 | 根拠 |
| --- | --- | --- | --- | --- |
| D1-01 | テスト | 既存の `test_適用結果がスキーマに通る` を、壊した `policy.py`（`cleanupPeriodDays:"30"`・set の値・SET の `:` を `,` と書き違える）で落ちることを変異で確かめる。報告書の P1 をこれに差し替える | P1 | UC 01・12。`test_policy_schema.py:57-68` |
| D1-02 | 文書・運用 | `release.md` 10 章に、型違い（本体の検証による読み捨て）を配ったときは配り直しだけでは戻らないことを書く。復旧は「直した版 → 利用者が `claude doctor` で名指しのキーを直す」の順。自動更新も止まりうる（未確認と明記） | P1 | UC 01。`release.md:127-133` |
| D1-03 | バグ修正 | `_govdir.backup` で、直前のバックアップと同じ内容なら取らない（成功として扱う）。uchg・A3・Windows でのファイルのロック（推定）のどれでも、本物のバックアップが押し出されるのを防ぐ | P2 | UC 13・06。`_settings.py:76-80`・`_govdir.py:62` |
| D1-04 | 仕様・テスト | ADD と REMOVE の重なりを `test_定義の形` で禁止する。仕様（差分が無ければ書かない）に合わせるなら、書くかどうかを「適用後の dict が元と等しいか」で決める | P2 | UC 06。`test_policy_schema.py:83-90`・`spec/plugin.md:89` |
| D1-05 | 文書（仕様） | `spec/plugin.md` に次を足す。本体が読めない settings.json ではプラグインが起動せず、端末から何も届かない。ONCE の記録は今の組だけを持つ。uninstall で既読と未送信分が消える | P2 | UC 01・13・06・60 |
| D1-06 | 知識 | schemastore と上流の食い違い（env の int）を knowledge に書き、`test_policy_schema.py` の docstring に「上流より厳しい方向の差は分かっている。逆向きは未確認」を 1 行足す | P3 | UC 01 notes 68 |
| D1-07 | バグ修正 | `_write` の一時ファイルを、例外の種類によらず `finally` で消す | P3（D1-01 のゲートがあるため） | UC 12。`_settings.py:66-87` |
| D1-08 | バグ修正 | `_apply_settings_step` の保護を `BaseException`（`KeyboardInterrupt` を除く）に広げる | P3 | UC 12。`session_start.py:134-137` |
| D1-09 | 仕様 | 書き込みビットの無い settings.json は書かない（`write_failed`）。0600 はそのままにする | P3 | UC 13。`_settings.py:60,80` |
| D1-10 | 仕様 | 書き戻しで直列化した結果が 2 MiB に近ければ書かない（本体の上限を自分で越えない） | P3 | UC 13。`_settings.py:69` |
| D1-11 | 仕様 | `_load` を `utf-8-sig` で読む（BOM 付きで永久に適用されない食い違いをなくす。書き戻しで BOM が外れる判断を伴う） | P3 | UC 13。`_settings.py:18` |
| D1-12 | バグ修正 | `save_once`・`_write_seen`・`sync_statusline` を mkstemp と `os.replace` で書く | P3 | UC 14。`_govdir.py:84,107`・`_notices.py:62-64` |
| D1-13 | 文書（利用者向け） | 撤去手順: 送信を済ませるか `--keep-data` を付ける。`statusLine` を外してから `governance/` を消す。入れ直すなら `governance/` を残す。配った値は手で消す | P3（今の `policy.py` は statusLine を配らない） | UC 60 |
| D1-14 | 知識 | `knowledge/claude-code-behavior.md:41` に「`-p` が上書きするのは `cli` と空だけ」を足す。コードは変えない（`decisions/plugin.md:83-84` で判断済み） | P3 | UC 24 |

## 5. 現在の文書・実装との不整合
| 箇所 | 内容 | 直し方 |
| --- | --- | --- |
| `docs/spec/plugin.md:89` と `_policy_ops.py:146-152`・`_settings.py:103-105` | 「差分が無ければ書かない」が、ADD と REMOVE が打ち消し合うときに成り立たない | D1-04 のどちらかで仕様と実装をそろえる |
| `plugin/hooks/session_start.py:77`（docstring） | 「非対話起動では何もしない」とあるが、実装は `sdk-` 始まりだけを除く。`claude-vscode`・未知の値の `-p` は既読にする | 「`sdk-` 始まりの起動では何もしない」に直す |
| `docs/spec/plugin.md:11-12` | `${CLAUDE_PLUGIN_DATA}` の状態がアンインストールで消える（未送信分を含む）ことが無い。`:106` の「残る」と対にならない | 1 行足す（D1-05） |
| `docs/guide/release.md:127-133`（10 章） | 型違いの復旧、ADD と REMOVE の重なり、版を下げても ADD と ONCE の上書きは戻らないこと、が無い | D1-02 と、報告書 4.5 の release.md 10 の行 |
| `docs/knowledge/claude-code-behavior.md:41` | ENTRYPOINT の上書きの範囲が不完全 | D1-14 |
| 報告書 4.1 P1（`test_policy_schema.py`） | 既存のテストを見落としている | D1-01 に差し替える |
| 報告書 4.1 P3（`session_start.py:75`） | 行番号の誤り。判断済みの事項の蒸し返しでもある | `:78-79` に直し、`decisions/plugin.md:83-84` を参照して knowledge の追記だけにする |
| 報告書 3.9 の `_settings.py:110-116`・`:59` | 前者は仕様どおり。後者は導入どおりでは到達しない | 前者は文書の項目へ移し、後者に「プロジェクト設定で有効化したときだけ」を注記する |
| uc-01 notes 79（「上流が公開する JSON Schema。版と取得元は要確認」） | 取得元と日付は `test_policy_schema.py:3-4` に既にある | notes は一時文書なので、報告書の側だけを直せばよい |

## 6. 他領域へ・未確認のこと
- D3: 4.1 P2「SessionStart の行の追記を identity の直後へ移す」には反証がある。UC 14 で全部が cancelled になった段では、`statusline.js` も作られなかった。つまり `sync_statusline`（`session_start.py:129-130`）より前、起動・import・identity の段階で止まっていた（推定）。identity の git には 3 秒のタイムアウトがあり（`_identity.py:17-18`）、5 秒の予算の大半を占めうる。またこの取りこぼしは `decisions/plugin.md:139-140` で受け入れている限界で、今回の新しい事実は頻度だけである。
- D4: 読み捨てで止まった端末と使っていない端末を区別できない件は、サーバの「最後に届いた時刻・途絶えた端末」の見せ方の問題である。parse_failed が 0 件でも健全の証拠にならない。
- D5: E2E の撤回の判定の穴（`e2e/test_settings.py:33-39,84-85`）はコードで確かめ、正しかった。本体が捨てる settings.json の E2E 1 本の追加もこちらで扱う。
- 未確認: 変異検査はしていない（D1-01 は読み取りと推論による）。確かめたのは、validator が型違いの値を拒否することだけである。読み捨て中の自動更新の挙動。Windows での `os.replace` の失敗の頻度。対話起動での表示。
