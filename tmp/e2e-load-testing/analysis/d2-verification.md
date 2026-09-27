# D2 収集と上流の事実 の精査

## 1. 結論（5 行以内）
- 報告書にある D2 の事実（同名モジュールで無言の全損になること、`validate_plugin.py` が見逃すこと、NULL 率が 4 列だけであること、context_tokens が PreCompact・Stop だけに入ること、シムによる遅延）は、コードで裏付けが取れた。
- 誤りが 1 つある。UC36 の「Stop が 2 回」を、notes は「サブエージェント自身の Stop」と解釈している。しかし生データの順序はこの解釈と合わない。実際には UserPromptSubmit も同じ数だけ増えており、親のターンが 1 つ増えている（バックグラウンドの Agent の完了通知によると推定）。`analyze.py` の検査もこの重複をゲートしていない。
- 誇張・一般化が 3 つある。「送るのは prev_value だけ」（UC38）、「`command_source` は `userSettings` か `plugin`」（UC35）、SessionStart の打ち切りの原因をシムに結び付けた記述（要約 5）である。
- 改善案のうち、概況の「NULL 率を HOOK_FIELDS の全列に広げる」は、そのままでは誤検知する。effort_level は haiku では正当に NULL になり、agent_id などはもともとまばらである。分布の表に NULL の行を出す案に絞るべきである。
- P1 は `validate_plugin.py` の 2 つの検査である。hook の実行検査は、入力 `{}` のままでも queue の行数を見れば足りる。

## 2. 発見の検証
| 発見 | UC | 判定 | 根拠（ファイル:行） | 報告書の要修正点 |
| --- | --- | --- | --- | --- |
| `json.py` と `uuid.py` を置くと exit 0・stderr 空・行 0・error 行 0 になる | 31 | 裏付けあり | `plugin/hooks/collect.py:11`（トップで import）・`:92`（`json.loads`）・`:123-128`（except から `append_error`）→ `_spool.py:3,54`（同じ `json.dumps`）・`:75`（黙って pass）。`_identity.py:7,97`（uuid は `append_error` でも使う） | 無し。ただし「高」の根拠として、`docs/decisions/plugin.md:37-39` が同名ファイルを既に禁じており、欠けているのはゲートだけ、と書くのが正確 |
| `validate_plugin.py` は同名ファイルを合格にする | 31 | 裏付けあり | `scripts/plugin_checks/files.py:105,127`（自モジュールを許す）。`hooks.py:116,126`（exit と stderr だけを見る） | 無し |
| `typing.py` と `pathlib.py` を置くと exit 1 とトレースバックになる | 31 | 裏付けあり（報告書に記載なし） | `collect.py:11-20` の import は try の外にある | 3 章へ（`spec/plugin.md:18` の「常に exit 0」には例外がある） |
| `-k collect` は 3 種とも落とす。キーの判定は全行を通して 1 つ以上 | 31 | 裏付けあり | `e2e/test_collect.py:45-47`、`docs/guide/e2e.md:134-136` | 無し |
| NULL 率は 4 列だけ。`skill_name` の分母は `tool_name='Skill'`。分布は `IS NOT NULL` だけを数える | 31・55 | 裏付けあり | `server/ccgov/store/queries_events.py:9-14,143`、`overview.html:31,39-40`（閾値は 50 と 20） | 4.1 の改善案に問題がある（4 章 D2-06） |
| `PermissionRequest` は `-p` の既定モードで発火し、`PermissionDenied` は発火しない | 31 | 裏付けあり（各 1〜2 回の観測） | notes の表 | notes は「既定モードの `-p` に `effort` が無い」を起動モードの差として書くが、既定モードの試行は haiku で、haiku には `effort` が届かない（`docs/knowledge/claude-code-behavior.md:45`）。モデルとモードが交絡している。knowledge にこの表を写すときは `effort` の行を外す |
| 同梱物は `governance:名前`、`command_source` は `userSettings` か `plugin` | 35 | 一部誤り（一般化） | 生データ（`.local/.../uc-36.../queue-raw.jsonl`）で `userSettings` と `plugin` を確認。試したのは利用者と同梱の 2 つの出どころだけ | 4.5 の「`userSettings` か `plugin`」を「観測した値は `userSettings`（利用者）と `plugin`（同梱）。プロジェクトと managed は未確認」に直す |
| `/compact` は UserPromptExpansion を経ない | 35 | 裏付けあり | 生データで PreCompact の直前に UPE・UPS が無い | 無し。圧縮の後の `SessionStart(source=compact)` は `claude-code-behavior.md:46` に既に書かれている（重複させない） |
| context_tokens が入るのは PreCompact・Stop だけ（9/9） | 36 | 裏付けあり | `collect.py:22,79-82` | 無し |
| agent_id で親子を区別できる | 36 | 裏付けあり | 生データで、子の Bash にだけ付き、Agent 自体の PostToolUse には付かない | 無し |
| Agent を使ったターンで Stop が 2 回出る（サブエージェント境界の Stop） | 36 | 誤り（解釈） | 生データの順序は UPS(8591)→PostToolUse Agent→**Stop(8591)→子の Bash(agent_id, prompt_id 8591)**→**UPS(4303、同じプロセス内で SessionStart を挟まない)**→親の Bash→Stop(4303)。子の Bash は 1 つ目の Stop より後にある。UPS と Stop はどちらも 7 件で 1 対 1 | 7 章と 4.5 を「Agent の完了のあと、親の新しいターン（新しい prompt_id の UPS と Stop）が 1 つ増える。Agent ツールは子の完了を待たずに戻っていた（推定: バックグラウンド実行）」に直す。「Stop だけが二重に数えられる」は誤り。サーバで Stop を数えている箇所は `context_distribution` だけ（`server/ccgov/web/admin.py:148`）で、ターン数としての集計は無い |
| 「送るのは管理対象キーの prev_value だけ」 | 38 | 一部誤り（誇張） | 本文に当たるものの漏れが 0 なのは正しい。ただし `spec/plugin.md:29-32` のとおり、`skill_name`・`command_name`・`command_source` は利用者が付けた名前を 255 字まで送る。`host`＝`platform.node()`（`_identity.py:92-93`）と `user_email` も送る | 2 章の表と要約を「本文は送らない。利用者由来の値で送るのは、管理対象キーの prev_value（スカラだけ）、スキル名とコマンド名、ホスト名、メールアドレス」に直す |
| notes の「`-k leak` は flush 後の data 配下を走査しない」 | 38 | 誤り（notes） | `e2e/test_leak.py:79` は flush の後に隔離ルート全体（data 配下を含む）を走査する。本当の穴は、最初の SessionStart で送った行を送信前に一度も走査しないこと（`:68`）と、生バイトを見ないこと（`e2e.md:156`） | 報告書はこの主張を採っていないので、報告書の修正は不要 |
| hook の処理は 30〜60 ms、9 割がシム、高負荷で最大 5.95 s | 43 | 裏付けあり（この Mac に限る） | notes の計測 2。`decisions/plugin.md:40` の「40 ms 台のプロセス」とも合う | 無し |
| 要約 5「同時起動・高負荷で SessionStart が打ち切られる。遅延の主因は pyenv のシム」 | 43・14・77 | 一部誤り（因果の飛躍） | UC43 は直列でしか測っていない。UC14 と UC77 の notes はシムに触れていない | 2 文を分け、シムの話は「この Mac では」と限定し、打ち切りの原因は未切り分けと書く |
| 版を上げない再 publish は `plugin update` で届かない | 55 | 裏付けあり | notes の表 | 4.5 の release.md 10 に足す「版の上げ忘れはサーバから検出できない」は、`docs/guide/release.md:20`（「上げ忘れを検出する仕組みは無い」）と重なる。足すのは上流の挙動と、uninstall→install で直ることだけにする |
| 4.5「未ログインの `-p` では SessionStart と UserPromptSubmit だけが動く」 | 43 | 裏付けあり（一部は既知） | `claude-code-behavior.md:44` に UPS の発火は既にある | 新しいのは「Stop は動かない」だけ |

## 3. 取りこぼし
- **本番の SessionStart が既に 5 秒に近い。**`docs/knowledge/measurements.md:93` に「SessionStart の所要（実運用ログ）4 秒前後が 2 件」がある。UC43 の高負荷での 5.95 s と合わせると、SessionStart の timeout を見直す根拠は人工の条件だけではない。一方 `measurements.md:91` の「hook 1 回 187〜201 ms」は、`python3` の解決方法（シムか実体か）が書かれておらず、UC43（実体 66 ms、シム 465 ms）と比べられない。
- **収集 hook も 5 秒を超えうる。**UserPromptExpansion が単体で 5.95 s（UC43、高負荷）だった。本体の下で打ち切られると、行が error 行も無く欠ける。報告書は SessionStart だけを扱っている。ただし collect の打ち切りを実物では観測していない（推定）。
- **`collect.py` の import の失敗は exit 0 の保証の外にある。**`collect.py:11-20` は try の外にあり、自モジュールの ImportError や構文エラーは stderr とexit 1 になる（UC31 の typing.py と pathlib.py）。これを止めているのは `validate_plugin.py` だけである。
- **`check_stdlib_only` は Python 3.10 未満では丸ごと SKIP になる**（`files.py:97-102`）。`release.md:24` は `python scripts/validate_plugin.py` としか書かず、macOS の `/usr/bin/python3` は 3.9.6（UC43）である。P1 の同名検査も同じ SKIP に巻き込まれる。
- **event 行には plugin_version が無い**（`contract.py:27-36`）。NULL 率が上がっても、版ごとに切り分けられない（UC55 の混在）。版を追えるのは policy 行と error 行だけである。
- **fixture に `userSettings` と `agent_id` の行が無い。**実採取の 112 件を数えたところ、`command_source` は `plugin` だけ、`agent_id` は 0 件だった。UC35・36 の事実を `tests/` で固定するには、`scripts/sanitize_fixtures.py` で採取し直す必要がある。
- **`e2e.md:141` の「対話でしか現れない値（`permission_mode` の `default` 以外）」は不正確である。**`-p --permission-mode auto` で `auto` が届いた（UC31）。`claude-code-behavior.md:36` も「`-p` では default」とだけ書いている。
- **UC36 の `analyze.py` のゲートは重複を検査していない。**「Agent と同じ prompt_id を持つ Stop が 2 件」は、Agent を使ったターンが 2 つあれば重複が無くても必ず成り立つ。`--break` で落ちることは、重複の存在を示していない。

## 4. 改善案
| ID | 観点 | 内容 | 優先度 | 根拠 |
| --- | --- | --- | --- | --- |
| D2-01 | バグ修正（検査） | `check_stdlib_only` で、`plugin/**/*.py` の stem が `sys.stdlib_module_names` に入っていたら NG にする。今の stem に該当は無いので、誤検知しない（3.13 で確認） | P1 | UC31、`files.py:105-127`、`decisions/plugin.md:37-39` |
| D2-02 | バグ修正（検査） | hook の実行検査の後、隔離した `plugin-data/queue.jsonl` が collect のコマンドごとに 1 行以上増えたかを見る。入力は `{}` のままでよい（`extract_event` は dict なら 1 行を作る） | P1 | UC31、`hooks.py:91-131`、`collect.py:27-49` |
| D2-03 | テスト | D2-01 と D2-02 を、`json.py` を置いたコピーで NG になることで確かめる（`validate_plugin.py` 自体のテストは今 0 件） | P1 | `tests/` に validate のテストが無い |
| D2-04 | 運用・文書 | `release.md` 3 に、`validate_plugin.py` は 3.10 以上で実行すること（3.9 では標準ライブラリの検査が SKIP になること）を書く | P2 | `files.py:97-102`、`release.md:24` |
| D2-05 | テスト（E2E） | `test_collect.py` で行が 0 件のとき、「全 hook が 0 行＝import の失敗の疑い」と出す | P2 | UC31 の R3、`test_collect.py:45` |
| D2-06 | 仕様（画面） | NULL の兆候は、分布の表（permission_mode・effort_level・source）に NULL の行を出して見せる。NULL 率を 12 列に広げる案は採らない（haiku の effort と SessionStart の permission_mode は正当に NULL で、`queries_events.py:8` の設計意図とぶつかる） | P2 | UC31・55、`claude-code-behavior.md:36,45` |
| D2-07 | 知識 | `upstream-features.md:90-92` を更新する。PermissionRequest は `-p` の既定モードで、許可リスト外のツールに対して発火する。キーは notes の表から `effort` を除いたもの。PermissionDenied は既定モードの拒否と deny ルールの拒否では発火しない（2.1.283、各 1〜2 回）。分類器による拒否は未確認 | P2 | UC31 |
| D2-08 | 知識 | Agent を使ったターンの順序を knowledge に書く。Agent ツールが子の完了前に戻る→親の Stop→子のツール呼出（呼び出したターンの prompt_id を持つ）→完了時に親の新しいターン（UPS と Stop）が起きる。Agent 自体の PostToolUse には agent_id が無い。解釈は推定と明記する | P2 | UC36・38 の生データ |
| D2-09 | 知識・性能 | `measurements.md` の「hook の実行」に、`python3` の解決方法ごとの値（実体 66 ms、シム 465 ms、高負荷の最大 5.95 s、20 MB の transcript でも Stop は変わらない）を条件つきで足す。191-201 ms の行には条件の不足を補う | P2 | UC43、`measurements.md:91,93` |
| D2-10 | 設計見直し | SessionStart の `timeout` を延ばすかを判断する（本番のログでも 4 秒前後がある）。collect 系は利用者を待たせる上限でもあるので 5 秒のままにし、打ち切りで行が欠けうることを spec に書く | P2 | `hooks.json:8-76`、`measurements.md:93`、UC43 |
| D2-11 | 文書（監査の説明） | 「送るもの」を 1 か所にまとめる。本文は送らない。送るのは、名指しした hook のキー、スキルとコマンドの名前（利用者の命名）、host、user_email、管理対象キーの prev_value（スカラだけ）。端末に残るのはバックアップと `.pyc`。置き場は `e2e.md` ではなく `spec/plugin.md` の収集の章が適切 | P2 | UC38、`spec/plugin.md:29-32`、`_identity.py:92` |
| D2-12 | 文書（E2E） | `e2e.md` の収集の限界を直す。`permission_mode` は `-p --permission-mode` でも default 以外が出ること。一部の hook だけでのキーの消滅は検出しないこと。PermissionDenied は `-p` では起こせないこと | P3 | UC31、`e2e.md:139-143` |
| D2-13 | 知識 | `command_source` の観測値（`userSettings` と `plugin`。プロジェクトと managed は未確認）と、`/compact` が UPE を経ないことを `upstream-features.md` に書く | P3 | UC35 |
| D2-14 | テスト | fixture を採り直し（`sanitize_fixtures.py`）、`userSettings` のコマンドとサブエージェントの行を入れて `test_collect_extract.py` で固定する | P3 | 3 章（fixture の集計） |
| D2-15 | 運用 | 「起動が遅い」という問い合わせの切り分け手順を書く。`command -v python3` と `time python3 -c pass` を見る。hooks.json の `python3` は変えない（`decisions/plugin.md:76`） | P3 | UC43 |
| D2-16 | 設計見直し | event 行に `plugin_version` を足すかを判断する。版の混在での NULL 率の切り分けに使える。代償は plugin.json を毎回読むことと収集項目の増加 | P3 | UC55、`contract.py:27-36`、`_identity.py:108-119` |
| D2-17 | 文書 | `spec/plugin.md` の「常に exit 0」は、自モジュールの import の失敗を含まず、それは `validate_plugin.py` が防ぐ、と注記する | P3 | `collect.py:11-20`、UC31 |

## 5. 現在の文書・実装との不整合
| 箇所 | 内容 | 直し方 |
| --- | --- | --- |
| `docs/knowledge/upstream-features.md:90-92` | PermissionRequest の「発火条件は未確認」 | D2-07 で更新する |
| `docs/guide/e2e.md:141` | `permission_mode` の default 以外は対話でしか現れない | `-p --permission-mode` でも出る、に直す |
| `docs/knowledge/claude-code-behavior.md:36` | `-p` では `permission_mode` が `default` | 「既定では」を補う |
| `docs/knowledge/measurements.md:91` | 187〜201 ms に `python3` の解決方法が書かれていない | 条件を足す（D2-09） |
| `decisions/plugin.md:37-39` と `validate_plugin.py` | 同名ファイルを禁じる規約に、検査が無い | D2-01 |
| `spec/plugin.md:18` と `collect.py:11-20` | 「常に exit 0」だが、import の失敗は例外になる | D2-17 |
| 報告書 2 章 UC38、1 章 7 | 「送るのは prev_value だけ」 | 2 章の修正点のとおり |
| 報告書 4.5 `upstream-features.md` の行 | 「Agent を使うターンで Stop が 2 回出た」「`command_source` は `userSettings` か `plugin`」 | D2-08 と D2-13 の書き方に直す |
| 報告書 4.1 P2 の概況の行 | 「NULL 率の対象を HOOK_FIELDS の全列に広げる」 | D2-06 の形に絞る |

## 6. 他領域へ・未確認のこと
- D3: UC43 の遅いサーバで POST が 27 回あったこと（送信プロセスの排他が無い）。SessionStart の行の追記を前に移す案（4.1 P2）。collect の打ち切りによる行の欠損は D2-10 と組にする。
- D4: 分布の表に NULL の行を出す実装と、NULL 率の列の並びの二重定義（`queries_events.py:9-14` と `overview.html:31`）。`ts` と `event_id` が欠けた行の破棄が見えないこと（UC55）。重複 event_id の保存（UC38）。
- D5: `analyze.py`（UC36）のゲートが重複を検査していない。UC38 の notes の「flush 後を走査しない」は誤り。E2E のプロンプトに Agent を入れるかは D5 の判断。
- 未確認のこと:
  - Agent がバックグラウンドで実行されたかどうか（`tool_input` を集めていないため、順序からの推定である）
  - 対話起動で同じ順序になるか
  - UC43 の数字が会社 PC（Windows と、そこでの `python3`）でも成り立つか
  - `sys.stdlib_module_names` の 3.9 での代替手段
