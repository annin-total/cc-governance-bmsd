# UC 31: hook の追加と上流のキーの変化（31・62・44）

## 目的

hook の追加（31）・上流の hook 入力のキーの改名や消滅（62）・`plugin/hooks/` への標準ライブラリと同名のモジュールの追加（44）に対して、
収集の E2E（`-k collect`）・`scripts/validate_plugin.py`・サーバの概況の健全性（NULL 率）がそれぞれ気づくかを実物で確かめる。

## 確かめる仮説（どう壊れうるか）

- H1: `PermissionDenied` を `hooks.json` に登録すると、見本のプロンプトでは発火せず `-k collect` が hook の集合の不一致で落ちる
- H2: `-p` では `PermissionDenied` は発火しない（公式文書では auto mode の拒否でだけ発火する）
- H3: `HOOK_FIELDS` のキーが上流で消えると、`-k collect` は列名つきで落ちる。サーバの概況の健全性はその列の NULL 率に反映する
- H4: `plugin/hooks/json.py` のような同名モジュールを足すと、hook は exit 0・標準エラー無しのまま queue 0 行になる（無言の失敗）。
  `validate_plugin.py` は exit 0 と無出力しか見ないので検出できない。`-k collect` は落ちる

## 負荷の掛け方

壊れた入力（hook の追加・キーの改名・同名モジュール）を 1 つずつ入れ、検査が落ちるかを見る。量の負荷は掛けない。

## 手順（実施順）

測定条件: macOS（Darwin 25.6.0）、`claude --version` = **2.1.283**、hook の `python3` = 3.13.2、認証は `ANTHROPIC_API_KEY`、`CC_E2E_RUN=c`。

1. 公式文書（https://code.claude.com/docs/en/hooks 、2026-09-27 取得）で `PermissionDenied` を確認
2. `shadow_probe.py`: `plugin/hooks/` に空の `<名前>.py` を置き、`collect.py`（Stop / PostToolUse）と `session_start.py` を直接起動して
   終了コード・stderr・queue+spool の行数・`validate_plugin.py` の結果を記録（API・Docker 不要。置いたファイルは finally で消す）
3. `permission_denied_probe.py`: 隔離 config の `settings.json` に採取 hook（`scripts/capture_hook_stdin.py`）を
   PreToolUse / PermissionRequest / PermissionDenied / PostToolUse / PostToolUseFailure に仕込み、`claude -p` を 1 回ずつ起動。
   記録はキー名と型だけ（`permission_mode`・`hook_event_name`・`tool_name` だけは列挙値なので値も記録）
4. `-k collect` を 3 回（それぞれ 1 か所だけ壊して）: R1 `hooks.json` に `PermissionDenied` を登録／R2 `contract.py` の `tool_name` のキーパスを
   `("tool_name_renamed",)` に変更／R3 `plugin/hooks/json.py`（空）を追加
5. `server_null_rate_probe.py`: `e2e/_server.py` で Docker のサーバを起動し、実採取の fixture 112 件（`tests/fixtures/hook_inputs/`、読むだけ）を
   本物の `collect.extract_event` に通した行を送信 → 概況 HTML を取得。続けて同じ入力から `tool_name`・`effort`・`session_id` を消した 112 件を送信 → 再取得

## 結果

### 1. hook の追加（UC 31）

- 公式文書: `PermissionDenied` は実在する。発火は「auto mode がツール呼出を拒否したとき（分類器の判定が無い拒否を含む）」。matcher はツール名。
  入力は共通項目（`session_id`・`prompt_id`・`transcript_path`・`cwd`・`permission_mode`・`effort` 等）＋ `tool_name`・`tool_input`・`tool_use_id`（文書の読み。実物では未確認）
- `-p` での実測（2.1.283、各 1 回）:

  | シナリオ | 発火した hook | `permission_denials` | 費用 |
  | --- | --- | --- | --- |
  | 既定モード・`--allowedTools Bash(echo:*)` で `ls /` を指示（haiku） | PreToolUse, **PermissionRequest** | Bash | 0.013 USD |
  | `--permission-mode auto`・`permissions.deny: Bash(ls:*)` で `ls /`（sonnet。`permission_mode` = `auto` を確認） | PreToolUse のみ | Bash | 0.033 USD ×2 |
  | auto mode で分類器に拒否させる（`.invalid` 宛ての curl） | なし（モデルが実行自体を断った） | なし | 0.030 USD |

  → **`PermissionDenied` は `-p` の既定モードの拒否でも、auto mode の deny ルールでの拒否でも発火しなかった。**分類器による拒否の経路は再現できず未確認。
  → 一方 **`PermissionRequest` は `-p` の既定モードでも発火した**（許可リスト外のツール。`docs/knowledge/upstream-features.md` の「発火条件は未確認」を更新できる）
- PermissionRequest の stdin のキーと型（2.1.283）: `session_id`:str, `transcript_path`:str, `cwd`:str, `prompt_id`:str, `permission_mode`:str,
  `hook_event_name`:str, `tool_name`:str, `tool_input`:{`command`:str, `description`:str}, `permission_suggestions`:list。
  既定モードの `-p` では `effort` が無かった（auto mode・sonnet の PreToolUse には `effort.level`:str があった）
- R1（`PermissionDenied` を登録して `-k collect`、76 秒）: **落ちた。**`assert {r["hook_event"] for r in rows} == registered` で
  `Extra items in the right set: 'PermissionDenied'`。hook の集合の比較で、何が発火しなかったかが名指しで出る。`validate_plugin.py` は合格のまま

### 2. 上流のキーの消滅・改名（UC 62）

- R2（`tool_name` のキーパスを存在しない名前に、71 秒）: **列名つきで落ちた。**`assert empty == []` → `AssertionError: assert ['tool_name'] == []`
- サーバの概況（Docker、各段 112 行、直近 7 日のみ・前 7 日は空）:

  | 列 | 段階 1（正常） | 段階 2（キーを消した 112 行を追加） |
  | --- | --- | --- |
  | tool_name | 0.0% 良好 | **50.0% 注意** |
  | skill_name | 0.0% 良好 | 0.0% 良好（変わらない） |
  | context_tokens | 100.0% 要対応 | 100.0% 要対応（fixture の transcript が無いため。合成データの副作用） |
  | command_source | 0.0% 良好 | 0.0% 良好 |
  | effort_level の分布 | high 61 / medium 13 | high 61 / medium 13（**変わらない**） |
  | permission_mode の分布 | auto 94 | auto 188 |
  | イベント数のタイル | 112 | 224 |

  - NULL 率の表は **4 列（`tool_name`・`skill_name`・`context_tokens`・`command_source`）だけ**。`HOOK_FIELDS` 12 列のうち表に無い 9 列
    （`session_id`・`prompt_id`・`source`・`compact_trigger`・`command_name`・`effort_level`・`permission_mode`・`agent_id`・`is_interrupt`）は、
    キーが消えても概況のどこにも兆候が出ない。`effort_level` は分布の表が `IS NOT NULL` で数えるので、全滅しても件数が増えないだけで気づけない。`session_id` の消滅も無言
  - **`skill_name` の NULL 率は `tool_name` の消滅に隠される。**分母が `tool_name = 'Skill'` の行なので、`tool_name` が NULL の行は分母から抜け、`skill_name` は 0.0% のまま
  - 閾値は 20% 超で「注意」、50% 超で「要対応」。上流の改名が版の混在で段階的に広がる間は「注意」止まりになりうる

### 3. 標準ライブラリと同名のモジュール（UC 44）

`shadow_probe.py` の結果（hook 3 種を直接起動。baseline は 5 行）:

| 置いたファイル | 終了コード | stderr | queue+spool 行 | error 行 | `validate_plugin.py` |
| --- | --- | --- | --- | --- | --- |
| （なし） | 0 | 空 | 5 | 0 | 合格 |
| `json.py` | 0 | **空** | **0** | **0** | **合格（検出しない）** |
| `uuid.py` | 0 | **空** | **0** | **0** | **合格（検出しない）** |
| `tempfile.py` | 0 | 空 | 5 | 2（`collect`/`AttributeError`, `apply_settings`/`AttributeError`） | 合格 |
| `logging.py` | 0 | 空 | 5 | 0 | 合格（誰も import しないので無害） |
| `typing.py` | 1 | トレースバック | 0 | 0 | 不合格（exit 0・無出力の検査と contract の import 検査） |
| `pathlib.py` | 1 | トレースバック | 0 | 0 | 不合格（exit 0・無出力の検査） |

- `json`・`uuid` の衝突は**完全に無言**（exit 0・stderr 空・行 0・error 行 0）。error 行を書く経路自体も同じ `json` を使うため、失敗の記録も残らない
- `validate_plugin.py` の標準ライブラリ検査（`check_stdlib_only`）は「標準ライブラリか自モジュールなら可」なので、同名の自モジュールを通してしまう。hook の実行検査は exit 0・無出力しか見ないので行 0 に気づかない
- R3（`json.py` を置いて `-k collect`、64 秒）: **落ちた。**error 行の検査は 0 件で通り、hook の集合の比較で `assert set() == {...}`（登録した全 hook が Extra items）。
  原因（import の衝突）はメッセージからは分からない
- `sys`・`time`・`_signal` は組み込み、`os` 等は起動時に読み込み済みで衝突しない（Python 3.13.2 の `sys.builtin_module_names` で確認。3.9 は未確認）

## 想定外だったこと

- `PermissionRequest` が `-p` でも発火した（`-p` では権限の確認を出さないので発火しないと見ていた）
- auto mode の deny ルールによる拒否でも `PermissionDenied` が発火しなかった（文書の「分類器の判定が無い拒否を含む」から、発火すると見ていた）
- `skill_name` の NULL 率が `tool_name` の消滅に隠される
- 分類器を拒否させるシナリオは、被験のモデル（sonnet）が実行を断り、さらに検証側（このセッション）の安全確認でも「取得して実行」型のコマンドを使う再試行が止められた。無理に進めていない

## 課題と改善案

- `e2e/`:
  - `test_collect.py` の hook 集合の比較で、行が 0 件のとき「全 hook が 0 行＝import の失敗の疑い」と分かるメッセージを添える（R3 の原因が読めない）
  - キーパスの判定は「全行を通して 1 つ以上」なので、**一部の hook でだけキーが消える改名は検出しない**（例: `effort.level` が PostToolUse で消え Stop に残る）。
    キーパスごとに「届くはずの hook」を持たせ、hook 単位で見る案（契約の註記 `# PostToolUse / ...` を機械可読にする必要がある。設計判断）
  - `PermissionDenied` を入れるなら、`prompts.json` に auto mode で分類器が拒否する安全な手順を足す必要がある。ただし本 UC の実測では再現できなかったので、先に対話での発火確認が要る
- `scripts/validate_plugin.py`: `plugin/hooks/*.py` の stem が `sys.stdlib_module_names` に含まれたら不合格にする（`check_stdlib_only` に 1 条件）。
  あわせて hook の実行検査で、`{}` 以外の最小の入力を与えて queue に 1 行以上増えることを見る（exit 0 だけでは無言の失敗を通す）
- サーバ（概況）: NULL 率の表が 4 列だけで、`effort_level`・`session_id` 等の消滅は兆候が出ない。`HOOK_FIELDS` の全列（届く hook を分母に）へ広げるか、
  少なくとも分布の表に NULL の行を出す案。`skill_name` の分母が `tool_name` に依存する点は、`tool_name` の NULL 率が上がったら `skill_name` の 0% を信用しない、と画面か運用手順に書く案（分母を変える良い列は今の契約に無い。要検討）
- `docs/guide/e2e.md` の収集の「限界」に: 一部の hook だけのキーの消滅は検出しない／`PermissionDenied` は `-p` では発火しない（2.1.283）を追記
- `docs/knowledge/upstream-features.md` §6 に（2.1.283）: `PermissionRequest` は `-p` の既定モードで許可リスト外のツールに対して発火し、キーは上表。
  `PermissionDenied` は `-p` の既定モードの拒否・auto mode の deny ルールの拒否では発火しない。分類器の拒否での発火は未確認
- e2e スキル: UC 44 の問いには `-k collect` だけでなく `shadow_probe.py` 相当（API 不要）で先に確かめられる、と案内する

## コードの変更

すべて使い捨てで、検証後に元へ戻した（`git diff` が空であることを確認済み）。

- R1: `plugin/hooks/hooks.json` に `PermissionDenied`（matcher `*`、`collect.py PermissionDenied`）を追加 → `git checkout` で復元
- R2: `plugin/hooks/contract.py` の `tool_name` のキーパスを `("tool_name_renamed",)` に → `git checkout` で復元
- R3 と `shadow_probe.py`: `plugin/hooks/<名前>.py`（空）を追加 → 削除
- 本物に入れるべきものは無い（改善案は上の節）

## 片付けたもの・残したもの

- Docker（`cc-e2e=c`）のコンテナ・イメージ: 無し（確認済み）
- `$TMPDIR/cc-e2e-*` のうち自分のもの: 無し（残っているのはトラック a のもの）。自分が作った `$TMPDIR/uc31-data-*` 2 件は削除済み
- `plugin/` 配下の `__pycache__`: 無し
- 残したもの: 本フォルダの一時スクリプト 3 本（`shadow_probe.py`・`permission_denied_probe.py`・`server_null_rate_probe.py`）と、
  `.local/e2e-load-testing/uc-31-hook-and-upstream-keys/`（pytest のログ r1〜r3、採取した stdin の形 `pd-*.json`、概況の HTML、`shadow_result.json`）
- API 費用: `-k collect` 3 回（1 回 0.1〜0.2 USD の見積り。実額は未取得）＋ `-p` の単発 4 回 計 約 0.11 USD → 合計 約 0.4〜0.7 USD
