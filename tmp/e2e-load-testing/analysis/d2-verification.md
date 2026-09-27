# D2 収集と上流の事実 の精査

## 1. 結論（5 行以内）
- 報告書にある D2 の事実はコードで裏付けが取れた。対象は、同名モジュールによる無言の全損、`validate_plugin.py` の見逃し、4 列だけの NULL 率、PreCompact と Stop だけに入る context_tokens、シムによる遅延である。
- 新しい重要事項が 1 つある。`validate_plugin.py` は、`plugin/config.json` の送信先が埋まっていれば、隔離したはずの hook 実行から本番へ POST する。コードで経路を確認した（確度は高い）。POST が実際に届くかは、隔離ディレクトリを消す処理との競合次第で、実測していない。直すのは 1〜2 行で済む。リリース前に入れる唯一の P1 とする。
- UC36 については、notes の解釈（サブエージェント自身の Stop）が誤りである。報告書の「Stop が 2 回」は、事実としては正しい。ただし「UPS と Stop が 2 組出る（親のターンが 1 つ増える）」と言い換える必要がある。
- 言い過ぎは 3 つある。UC38 の「送るのは prev_value だけ」、UC35 の `command_source` の値の一般化、要約 5 がシムを打ち切りの原因と断定していること（未切り分け）である。
- 利用者の方針（厳格にしすぎない）に合わせ、同名モジュールの検査と SKIP の穴は予防策として P2 にした。hook のタイムアウトは 10〜30 秒への延長を前提に書き直した。

## 2. 発見の検証
| 発見 | UC | 判定 | 根拠（ファイル:行） | 報告書の要修正点 |
| --- | --- | --- | --- | --- |
| `json.py` と `uuid.py` を置くと exit 0・stderr 空・行 0・error 行 0 になる | 31 | 裏付けあり | `plugin/hooks/collect.py:11,92,123-128`、`_spool.py:3,54,75`、`_identity.py:7,97` | 無し。重大度の根拠には、規約（`decisions/plugin.md:37-39`）があるのに validate にゲートが無いこと、E2E は認証や `claude` が無いと skip されうること（`release.md:10-12`）を添える |
| `validate_plugin.py` は同名ファイルを合格にする | 31 | 裏付けあり | `scripts/plugin_checks/files.py:105,127`、`hooks.py:116,126` | 無し |
| `typing.py` と `pathlib.py` を置くと exit 1 とトレースバックになる | 31 | 裏付けあり（報告書に記載なし） | `collect.py:11-20` の import は try の外 | 3 章へ |
| `-k collect` は 3 種とも落とす。キーの判定は全行を通して 1 つ以上 | 31 | 裏付けあり | `e2e/test_collect.py:45-47`、`docs/guide/e2e.md:134-136` | 無し |
| NULL 率は 4 列だけ。`skill_name` の分母は `tool_name='Skill'`。分布は `IS NOT NULL` だけを数える | 31・55 | 裏付けあり | `server/ccgov/store/queries_events.py:9-14,143`、`overview.html:31,39-40` | 4.1 の改善案は D2-06 の形に直す |
| `PermissionRequest` は `-p` の既定モードで発火し、`PermissionDenied` は発火しない | 31 | 裏付けあり（各 1〜2 回） | notes の表 | notes の「既定モードの `-p` に `effort` が無い」は、haiku であること（`claude-code-behavior.md:45`）と交絡している。knowledge に写すときは `effort` を外す |
| 同梱物は `governance:名前`、`command_source` は `userSettings` か `plugin` | 35 | 一部誤り（一般化） | 生データ（`.local/.../uc-36.../queue-raw.jsonl`）。試した出どころは 2 つだけ | 「観測した値は `userSettings`（利用者）と `plugin`（同梱）。プロジェクトと managed は未確認」に直す |
| `/compact` は UserPromptExpansion を経ない | 35 | 裏付けあり | 生データ | 圧縮の後の SessionStart(compact) は `claude-code-behavior.md:46` に既にある（重複させない） |
| context_tokens が入るのは PreCompact と Stop だけ（9/9） | 36 | 裏付けあり | `collect.py:22,79-82` | 無し |
| agent_id で親子を区別できる | 36 | 裏付けあり | 生データ（子の Bash にだけ付き、Agent 自体の PostToolUse には付かない） | 無し |
| Agent を使うと Stop が 2 回出る | 36 | notes の解釈は誤り。報告書は言い換えが必要 | 下の注を参照 | 34・250・331 行を「利用者の入力 1 回で UPS と Stop が 2 組出る（親のターンが 1 つ増える。プロンプト数とターン数は水増しされる）。Agent は子の完了を待たずに戻った（推定）」に直す。影響: サーバは UPS も Stop も件数として集計していない（`server/ccgov/web/admin.py:148` の分布だけ） |
| 「送るのは prev_value だけ」 | 38 | 一部誤り（誇張） | `spec/plugin.md:29-32`（スキル名・コマンド名は利用者の命名を 255 字まで送る）、`_identity.py:92-93`（host＝`platform.node()`）、user_email | 「本文は送らない。利用者由来の値で送るのは、管理対象キーの prev_value（スカラだけ）、スキル名とコマンド名、host、user_email」に直す |
| notes の「`-k leak` は flush 後の data 配下を走査しない」 | 38 | 誤り（notes） | `e2e/test_leak.py:79` は flush の後に隔離ルート全体を走査する。走査で見ていないのは送信の生バイトだけ（`e2e.md:156`） | 報告書はこの主張を採っていないので修正は不要 |
| hook の処理は 30〜60 ms、9 割がシム、高負荷で最大 5.95 s | 43 | 裏付けあり（この Mac に限る） | notes の計測 2、`decisions/plugin.md:41` | 無し |
| 要約 5「打ち切りの主因は pyenv のシム」 | 43・14・77 | 一部誤り（未切り分け） | UC43 は直列でしか測っていない。UC77 の `session_start.py` 単体の p50 は 0.46〜0.49 s（uc-77 notes:106）で、シムの経由と整合する | 「打ち切りの原因は未切り分け。UC77 の単体の所要はシムの経由と整合し、寄与した可能性が高い」に直す |
| 版を上げない再 publish は `plugin update` で届かない | 55 | 裏付けあり | notes の表 | 「サーバから検出できない」は `release.md:20` と重なる。足すのは上流の挙動と、uninstall→install で直ることだけにする |
| 4.5「未ログインの `-p` では SessionStart と UserPromptSubmit だけが動く」 | 43 | 裏付けあり（一部は既知） | `claude-code-behavior.md:44` | 新しいのは「Stop は動かない」だけ |

UC36 の注: 決め手は 2 つある。
1. Agent の PostToolUse（ts 683）が、子の Bash（690）より 7 秒前に出ている。同期実行なら順序は逆になる。
2. `uc-35.../probe.py:80-88` の指示は「子の返答の後に親が echo する」である。一方、親の Bash は新しい UPS（prompt_id 4303）の後に出ている。この間に SessionStart は無く、同じ `-p` プロセスの中である。UPS と Stop はどちらも 7 件で、1 対 1 に対応する。

論拠にした区間は `queue.jsonl` 1 ファイルの中の追記順である。生データは queue と spool を連結したもので（`e2e/_root.py:154-160`）、末尾の SessionStart は時刻が逆転している。

上流の文書では、サブエージェントの終了は `SubagentStop` で知らされる。本プラグインは `SubagentStop` を登録していないので、実測はできない。

## 3. 取りこぼし
- **`validate_plugin.py` が本番へ POST しうる（コードで確認、確度は高い。実際の到達は未実測）。**
  - 経路: `hooks.py:96-99` が隔離するのは `CLAUDE_PLUGIN_DATA` と `CLAUDE_CONFIG_DIR` だけで、`CLAUDE_PLUGIN_ROOT` には開発ツリーの `plugin/` を渡す。
  - hooks.json の順（UPS→UPE→PostToolUse→PostToolUseFailure→PreCompact→**Stop**）で実行すると、Stop の時点で queue があり `sent_at` が無い。このため `should_send` が真になる（`_spool.py:80-94`、`collect.py:118-119`）。
  - `_sender.launch()` は環境を引き継いで切り離し起動する（`_sender.py:111-122`）。送信プロセスは `Path(__file__).parent.parent / "config.json"`、つまり `plugin/config.json` を読む（`:17`）。`ingest_url` が空でなければ spool を POST する（`:90-100`）。
  - `release.md:13` は初回リリースの前にこの値を埋めさせ、同じ手順の 3 番（`:24`）で validate を実行する。
  - 届く行は collect の 6 行で、user_email は `validate-plugin-py@example.invalid`、host は実機のホスト名である。以後のリリースでも、実行のたびに本番の DB に架空の利用者が増える。
  - 不確かな点: validate は SessionStart を実行した後、`finally` で隔離ディレクトリを `rmtree` する（`hooks.py:132-133`）。送信プロセスが spool を読む前に消されれば送られない（競合）。送信プロセスは実体の python で起動する（`sys.executable`）。hook 1 本分（0.1〜0.5 s）の猶予に対し、rotate と read は数十 ms で終わる見込みなので、送られる公算が大きい（推定）。
  - 配布リポジトリの `scripts/validate.py` は hook を実行しない（`claude plugin validate` と git だけ）ので、該当しない。
  - 今は `config.json` が空なので、実害はまだ出ていない。
- **本番の SessionStart が既に 5 秒に近い。**`measurements.md:93` に実運用ログで 4 秒前後が 2 件ある。`measurements.md:91` の「187〜201 ms」は `python3` の解決方法が書かれておらず、UC43 と比べられない。
- **collect の hook も高負荷で 5 秒を超えうる**（UserPromptExpansion が単体で 5.95 s）。本体の下で打ち切られると、行が error 行も無く欠ける（推定）。
- **`collect.py` の import の失敗は exit 0 の保証の外にある**（`collect.py:11-20`）。止めているのは validate だけである。
- **`check_stdlib_only` は Python 3.10 未満では SKIP になる**（`files.py:97-102`）。`release.md:24` は Python の版を指定していない。
- **fixture に `userSettings` と `agent_id` の行が無い**（112 件中、`command_source` は `plugin` の 4 件だけ、`agent_id` は 0 件）。
- **`e2e.md:141` の「`permission_mode` の default 以外は対話でしか現れない」は不正確である**（`-p --permission-mode auto` で `auto` が届いた。UC31）。
- **UC36 の `analyze.py` のゲートは重複を検査していない。**「Agent と同じ prompt_id を持つ Stop が 2 件」は、Agent を使ったターンが 2 つあれば必ず成り立つ。

## 4. 改善案
| ID | 観点 | 内容（短く） | 優先度 | 根拠 |
| --- | --- | --- | --- | --- |
| D2-18 | バグ修正（検査の隔離） | validate の hook 実行の前に、隔離した `plugin-data/sent_at` を作って送信を止める（`should_send` が偽になる）。本番へ POST しないことを、送信先を埋めたコピーで確かめる | P1 | 3 章、`hooks.py:91-116`、`_spool.py:80-94`、`release.md:13,24` |
| D2-01 | バグ修正（検査） | `check_stdlib_only` で、`plugin/**/*.py` の stem が `sys.stdlib_module_names` に入っていたら NG にする。今の stem に衝突は無い（3.10・3.11・3.13）。限界として、検査を実行した Python の表で判定するので、配布先の版にだけある名前は見ない | P2 | UC31、`files.py:105-127`、`decisions/plugin.md:37-39` |
| D2-04 | バグ修正（検査） | D2-01 と組にする。3.10 未満の SKIP を NG にするか、`release.md` 3 に 3.10 以上を必須と書く（SKIP 1 つで D2-01 が無効になるため） | P2 | `files.py:97-102`、`release.md:24` |
| D2-02 | バグ修正（検査） | D2-18 で `sent_at` を作ったうえで、hook のコマンドごとに queue と spool の行の和が増えたかを見る。`session_start.py` も含める。入力は `{}` のままでよい | P2 | UC31、`hooks.py:91-131`、`collect.py:27-49` |
| D2-03 | テスト | D2-01・02・18 を、壊したコピー（`json.py` を置く・送信先を埋める）で落ちることで確かめる（validate のテストは今 0 件） | P2 | `tests/` |
| D2-10 | 設計見直し | hooks.json の timeout を延ばす。SessionStart は 30 秒、collect 系は 10 秒（利用者の方針で 10〜30 秒は許容。普段は 1 秒未満なので体感は変わらない） | P2 | `hooks.json:8-76`、`measurements.md:93`、UC43・77 |
| D2-05 | テスト（E2E） | `test_collect.py` で行が 0 件のとき、「全 hook が 0 行＝import の失敗の疑い」と出す | P2 | UC31 の R3、`test_collect.py:45` |
| D2-07 | 知識 | `upstream-features.md:90-92` を更新する。PermissionRequest は `-p` の既定モードで、許可リスト外のツールに対して発火する（キーは notes の表から `effort` を除く）。PermissionDenied は既定モードの拒否と deny ルールの拒否では発火しない（2.1.283、各 1〜2 回）。分類器による拒否は未確認 | P2 | UC31 |
| D2-08 | 知識 | Agent を使ったターンの順序を書く。Agent が先に戻る→親の Stop→子のツール（呼び出したターンの prompt_id を持つ）→完了時に親の新しいターン（UPS と Stop）。Agent 自体の PostToolUse には agent_id が無い。解釈は推定と明記する | P2 | UC36・38 |
| D2-09 | 知識・性能 | `measurements.md` の「hook の実行」に、`python3` の解決方法ごとの値（実体 66 ms、シム 465 ms、高負荷の最大 5.95 s、20 MB の transcript でも Stop は不変）を条件つきで足す | P2 | UC43、`measurements.md:91,93` |
| D2-11 | 文書（監査の説明） | 「送るもの」を `spec/plugin.md` の収集の章にまとめる。本文は送らない。送るのは名指しのキー、スキルとコマンドの名前、host、user_email、管理対象キーの prev_value。端末に残るのはバックアップと `.pyc` | P2 | UC38、`spec/plugin.md:29-32` |
| D2-06 | 仕様（画面） | NULL 率は 12 列に広げない。存在が保証される列（`session_id`＝全行、`prompt_id`・`permission_mode`＝SessionStart 以外）だけを、分母を付けて足す | P3 | UC31・55、`queries_events.py:8-14,124` |
| D2-12 | 文書（E2E） | `e2e.md` の収集の限界を直す。`permission_mode` は `-p --permission-mode` でも default 以外が出る。一部の hook だけでのキーの消滅は検出しない。PermissionDenied は `-p` では起こせない | P3 | UC31、`e2e.md:139-143` |
| D2-13 | 知識 | `command_source` の観測値と、`/compact` が UPE を経ないことを書く | P3 | UC35 |
| D2-14 | テスト | fixture を `sanitize_fixtures.py` で採り直し、`userSettings` と agent_id の行を入れて固定する | P3 | 3 章 |
| D2-15 | 運用 | 「起動が遅い」の切り分け手順（`command -v python3`・`time python3 -c pass`）。hooks.json の `python3` は変えない（受け入れ済み。`decisions/plugin.md:76`） | P3 | UC43 |
| D2-17 | 文書 | `spec/plugin.md:18` の「常に exit 0」は、自モジュールの import の失敗を含まず、それは validate が防ぐ、と注記する | P3 | `collect.py:11-20` |

## 5. 現在の文書・実装との不整合
| 箇所 | 内容 | 直し方 |
| --- | --- | --- |
| `scripts/plugin_checks/hooks.py:96-116` と CLAUDE.md の「検証の送信先を本番に向けない」 | 隔離が送信先に及ばない | D2-18 |
| `docs/knowledge/upstream-features.md:90-92` | PermissionRequest の「発火条件は未確認」 | D2-07 |
| `docs/guide/e2e.md:141`、`claude-code-behavior.md:36` | `permission_mode` の default 以外は対話でしか出ない、`-p` では default | 「既定では」と補い、`--permission-mode` で変わると書く |
| `docs/knowledge/measurements.md:91` | 187〜201 ms に `python3` の解決方法が書かれていない | D2-09 |
| `decisions/plugin.md:37-39` と validate | 規約はあるが検査が無い | D2-01・04 |
| `spec/plugin.md:18` と `collect.py:11-20` | 「常に exit 0」に例外がある | D2-17 |
| 報告書 2 章 UC38・1 章 7 | 「送るのは prev_value だけ」 | 2 章のとおり |
| 報告書 34・250・331 行 | 「Stop が 2 回」 | 2 章の注のとおり言い換える |
| 報告書 4.1 P2 の概況の行 | 「HOOK_FIELDS の全列に広げる」 | D2-06 |
| 報告書 4.1 P2 の `session_start.py` の行 | 「timeout を 5 から 15 秒にするか検討」 | 方針に沿って D2-10 の値で確定させる |

## 6. 他領域へ・未確認のこと
- D3:
  - UC43 の遅いサーバで POST が 27 回あったこと（送信プロセスの排他が無い）。
  - SessionStart の行の追記を前に移す案。D2-10 で延ばせば必要性は下がる。
- D4:
  - NULL 率の列の二重定義（`queries_events.py:9-14` と `overview.html:31`）と D2-06 の実装。
  - `ts` と `event_id` が欠けた行の破棄が見えないこと（UC55）。
  - 重複 event_id の保存（UC38）。
- D5:
  - UC36 の `analyze.py` のゲートが重複を検査していない。
  - UC38 の notes の「flush 後を走査しない」は誤り。
  - D2-18 の確認は、E2E の手順（送信先を埋めたコピー）で行える。
- 未確認のこと:
  - D2-18 の POST が実際に本番へ届くか（validate の `rmtree` との競合。要実測）。
  - Agent がバックグラウンドで実行されたか（`tool_input` を集めていないため推定）。
  - 対話起動でも同じ順序になるか。
  - UC43 の数字が会社 PC でも成り立つか。

## 7. レビューへの対応
| 指摘 | 採否 | 理由 |
| --- | --- | --- |
| UC36 の決め手を「Agent が 7 秒前に戻る」と「probe の指示の順序」にする。生データが queue と spool の連結であること、SubagentStop のことを明記する | 採る | 同じ秒の追記順は決め手として弱い。生データと probe.py:80-88 で確かめた |
| UC36 の判定を「notes の解釈は誤り、報告書は言い換え」に分け、サーバは UPS と Stop を集計していないと書く | 採る | 報告書 34 行は事実として正しく、331 行も推定と書いている |
| D2-02 は退避との競合で誤検知し、session_start.py を見逃す | 採る | `collect.py:118-119`・`_sender.py:94` のとおり。`sent_at` の事前作成、queue と spool の和、session_start.py を含める形に直した |
| validate が本番へ送信しうる経路 | 採る（P1、D2-18） | 経路はコードで確認した（確度は高い）。到達は `rmtree` との競合で未実測。修正は 1〜2 行で、リリース時に実害が出る |
| D2-01・02 を P1 とする根拠（E2E は skip されうる） | 一部採る | 根拠の書き換えは採る。ただし利用者の方針（P1 は実害のあるものだけ）に従い、P2 に下げた。今の stem に衝突は無く、規約もあり、E2E が走れば落ちる |
| D2-04 を D2-01 と組にして P1 にする | 一部採る | 組にするのは採る。優先度は D2-01 と同じ P2（上と同じ理由） |
| D2-01 の限界（検査する Python の表で判定する）を書く | 採る | 1 文足した。SyntaxError の扱いは実行の検査が拾うので現状のまま |
| D2-06 の理由付けの自己矛盾 | 採る | 分布の表に NULL の行を出す案も、同じ誤検知の問題を抱える。存在が保証される列だけ分母を付けて足す形に直し、方針に沿って P3 にした |
| 要約 5 への反論は半分だけ正しい | 採る | uc-77 notes:106 の p50 0.46〜0.49 s は、シムを経由した値と整合する |
| UC38 の「本当の穴は :68」は誤り | 採る | SessionStart の行は SENTINEL を入力する前に作られ、DB の走査でも覆われる。穴は生バイトを見ないことだけにした |
| 行番号のずれ（`decisions/plugin.md:41`） | 採る | 修正した |
| （利用者の方針）hook のタイムアウトは 10〜30 秒を許容する | 採る | D2-10 を具体値（SessionStart 30 秒、collect 10 秒）で書き直した |
| （利用者の方針）受け入れ済みのものは蒸し返さない | 採る | D2-15 の `python3` の固定は「受け入れ済み」と書くだけにした。前回の D2-16（event 行に plugin_version を足す）は YAGNI として取り下げた（policy 行での近似で足りる） |
| （利用者の方針）CSV は任意 | 該当なし | D2 の改善案は CSV を前提にしていない |
