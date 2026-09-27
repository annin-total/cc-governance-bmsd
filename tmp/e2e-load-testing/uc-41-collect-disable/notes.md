# UC 41: 収集の停止と再開（`CC_GOVERNANCE_DISABLE`）

## 目的

`CC_GOVERNANCE_DISABLE` が実際にどこを止め、どこを続けるかを実物で確かめる。特に：

- 値の種類（`1`・`true`・`0`・空文字）ごとの効き方
- 設定の仕方（シェルの環境変数／利用者が自分の `settings.json` の `env` に直接書いた場合）の違い
- 外した（再開した）ときに、正しく戻るか。止めていた期間の内容が後から漏れて出てこないか
- ドキュメント（`docs/spec/plugin.md` の記述・`docs/decisions/plugin.md` #12・#48）と実際の挙動の一致

## 確かめる仮説（どう壊れうるか）

1. `bool(os.environ.get(...))` は Python の文字列真偽値なので、`"0"` も空でない文字列として真になり、
   利用者が「0 = 無効化しない」のつもりで設定すると裏切られるはず（コードを先に読んで確認済み。
   ドキュメントは「空でないとき」と明記しており、実装と一致する想定）
2. 無効化は `collect.py` の `_DISABLE_ENV` 判定 1 箇所（`session_start.py` の `main()` と、独立の
   `collect.py` の `main()` の 2 か所）にしか無いので、`SessionStart` 以外の hook
   （`PostToolUse` など）でも同様に止まるはずだが、`PostToolUse` は今回のスキルの `-p ok`
   （ツール呼び出し無し）では発火しないため、この UC では確かめられない
3. `session_start.py` の順序上、`_apply_settings_step()`（policy の適用）は `disabled` の判定より前に
   実行され、無効化の対象に入っていない。ここは止まらないはず
4. `_govdir.sync_statusline` も無効化の対象に入っていないので、無効化中も同期され続けるはず
5. 無効化中は `_collect_step` が `_spool.append` を呼ばないので、そもそも行がキューに積まれない。
   したがって「止めていた期間の内容が後から漏れて出る」経路は無いはず（積んでいない物は送れない）
6. 利用者が自分の `settings.json` の `env` に直接 `CC_GOVERNANCE_DISABLE` を書いた場合、
   `apply_settings` は policy（`SET`/`ADD`/`REMOVE`）にない項目には触れない設計（UC 06 で確認済みの
   REMOVE の挙動と同じ思想）なので、この項目を書き消さないはず。かつ Claude Code 本体は
   `env` ブロックの実効値を hook プロセスの環境変数に合成する
   （`docs/knowledge/claude-code-behavior.md` 19 行目）ので、シェルで export しなくても届くはず

## 手順

`tmp/e2e-load-testing/uc-41-collect-disable/run.py`（`CC_E2E_RUN=a` 必須。未認証 `claude -p ok`）。
`e2e/_flow.py`・`_root.py`・`_market.py`・`_githttp.py` を import して使う。`_root.py` の
`_EXTRA_KEYS` に既に `CC_GOVERNANCE_DISABLE` が許可リスト登録済みなので、シェル環境変数側は
そのまま使えた。

- **Route A（シェルの環境変数）**: 1 つの隔離ルートで、`policy.py` は空の `SET`（`autoUpdate` のみ）、
  `notices.json` に見本（`e2e/samples/notices.json`）を重ねて導入。この順でセッションを重ねる:
  baseline（無効化なし）→ `disable=1` → `disable=true` → `disable=0` → `disable=''`（再開）→
  再開後 2 回目。各セッションで新規行の `kind` の集合・`systemMessage` の有無・error 行・
  `statusline.js` の mtime を見る
- **Route B（利用者が自分の `settings.json` の `env` に直接書いた場合）**: 別の隔離ルートで baseline を
  1 回流した後、`settings.json` を直接編集して `env.CC_GOVERNANCE_DISABLE = "1"` を追加（policy の
  配布ではない）。シェル側の `extra_env` は渡さない。セッションを流し、hook まで届くか・
  `apply_settings` がこの項目を書き消さないかを見た後、キーを消して再開を確認
- **判定がゲートしているかの確認**: `session_start.py` の `disabled` チェックを外した mutant
  （`gate_check.py`）を配り、`disable=1` でも `event` 行が混ざる（判定が壊れた実装を検出する）ことを
  確かめた

## 負荷の掛け方

負荷は掛けていない（この UC は「外界の事実の確認」で、規模・並行は対象外。前提どおり
「認証不要・Docker不要」）。セッションは合計 9 回（Route A 6・Route B 3）+ gate_check 1 回、逐次実行。

## 結果

`.local/e2e-load-testing/uc-41-collect-disable/route_a.json`・`route_b.json` に生ログ。

| セッション | 値 | 出た `kind` | お知らせ | error 行 |
| --- | --- | --- | --- | --- |
| A0 baseline | なし | event, policy | 出た | 0 |
| A1 | `1` | policy のみ | 出ない | 0 |
| A2 | `true` | policy のみ | 出ない | 0 |
| A3 | `0` | policy のみ | 出ない | 0 |
| A4（再開） | `''`（空） | event, policy | 出た | 0 |
| A5（再開後2回目） | なし | event, policy | 出た（想定どおり。後述） | 0 |
| B0 baseline | なし | event, policy | 出た | 0 |
| B1（`settings.json` 直書き） | env に `"1"` | policy のみ | 出ない | 0 |
| B2（再開） | キーを削除 | event, policy | 出た | 0 |
| gate_check（mutant） | `1` のはずが無効化チェックを外した | event, policy（判定が落ちた） | — | — |

- **仮説 1（値の種類）を確認**: `"0"` も `"true"` と同じく無効化する。`bool("0")` が真になる
  Python の一般的な挙動どおりで、`docs/spec/plugin.md` の「空でないとき」という記述とも一致する。
  実装とドキュメントは食い違っていない。ただし**利用者向けの案内にこの言い回しが出てくる予定があるなら、
  「0 は無効化しない」という直感に反する**ため、案内文面を書くときの落とし穴として明記する価値がある
- **仮説 3・4 を確認**: 無効化中も `policy` 行は毎回記録され（`autoUpdate` の適用が続く）、
  `statusline.js` の mtime は無効化中も変わらず残る（同期は毎回内容比較のため、変化が無ければ
  mtime も変わらない。これは「書き換えていない」ことの確認であり「同期処理が動いた」ことの直接証拠
  ではない。動いたことは `_govdir.sync_statusline` がここより前で無条件に呼ばれているという
  コード上の構造から推論している）
- **仮説 5 を確認（最重要）**: 無効化中の 3 セッション（A1〜A3）は `kind` が `policy` のみで、
  `queue.jsonl`・`spool/` のどこにも `event` 行が無い。再開後（A4）に無効化期間の内容が後から
  出てくることは無かった。**そもそも積んでいないので漏れる経路が無い**という設計になっている
- **Route B を確認**: `settings.json` に利用者が直接書いた `env.CC_GOVERNANCE_DISABLE` は、
  次の `SessionStart` の `apply_settings` を経ても書き消されず（`policy.py` の `SET`/`ADD`/`REMOVE`
  に無い項目には触れない設計）、かつシェル環境変数を渡さなくても hook プロセスまで届いて無効化が効いた。
  Claude Code 本体が `settings.json` の `env` を子プロセスの環境変数に合成する、という
  `docs/knowledge/claude-code-behavior.md` の既存の知見が、この無効化スイッチにも当てはまることを
  実物で確認した
- **A5 は「失敗」ではない**: 最初は「再開後 2 回目は既読になっているはず」で組んだが落ちた。
  理由は `claude -p` が headless 判定になり、`_mark_seen_and_open` が `_browser.is_headless()` で
  早期 return して `seen.json` を書かないため（`docs/guide/e2e.md`「お知らせ」節・
  `e2e/test_notices.py` の `test_未読のお知らせが出て_pでは既読にしない` と同じ既知の仕様）。
  この UC は全セッションが `-p` なので、**「既読になって本当に消えるか」までは確かめられない**。
  これは元のユースケース集の「スキルでできないこと: 対話起動での挙動」と一致する既知の限界であり、
  新しい不具合ではないため、チェックを「2 回目も同じお知らせが出る（劣化していない）」に直した
- **判定のゲート確認**: `session_start.py` の無効化チェックを外した mutant では `disable=1` でも
  `event` 行が混ざり、`kinds == ['policy']` という判定は正しく落ちた。判定は無効化を実際に見ている

## 想定外だったこと

- A5 の「既読」期待が外れたこと（上述。仕様どおりで、こちらの期待が誤っていた）
- それ以外は仮説どおりで、想定外の壊れ方は見つからなかった。ドキュメント
  （`docs/spec/plugin.md`・`docs/decisions/plugin.md` #12・#48）と実装は一致していた

## 課題と改善案

- **e2e/ への追加案（P3・nice-to-have）**: `e2e/test_notices.py` の `test_無効化スイッチで出ない`
  は `disable=1` の 1 値しか見ていない。`"0"` のような直感に反する値を回帰させたいなら、
  同ファイルに `@pytest.mark.parametrize("val", ["1", "true", "0"])` で増やす候補（今回の
  `run.py` の Route A の一部を移す形）。優先度は低い（決定文書に明記済みで、値の種類は
  「空かどうか」という単純な規則なので、テストが増えても壊れ方の検出力が上がる度合いは小さい）
- **docs/knowledge/ への追加案**: 「`env` ブロックが子プロセスの環境変数に合成される」という既存の
  知見（`docs/knowledge/claude-code-behavior.md` 19 行目）に、「利用者が自分の `settings.json` に
  追加した、policy が関与しないキーも、次回の `apply_settings` で書き消されない」という一文を
  加える価値がある。UC 06 で REMOVE の挙動として確認済みの設計だが、無効化スイッチのような
  「policy が触らないキー」の観点で明文化されたことは無かった
- **利用者向け案内文言の注意（実装ではなく文面の課題）**: もし今後、管理者向け・利用者向けの
  オンボーディング文書（`docs/guide/onboarding.md` 等）に `CC_GOVERNANCE_DISABLE` の使い方を書くなら、
  「0 を入れても無効化が解除されない（空文字にする必要がある）」を明記すること。現時点ではこの
  変数はどの利用者向け文書にも載っていない（`docs/spec/plugin.md` のみ、開発者向け）ため、
  今は不一致ではないが、将来書くときの罠として記録する
- バグと思われるものは見つからなかった（ファイル:行を示すべき指摘は無し）

## 片付けたもの・残したもの

- 隔離ルート（`E2ERoot`）・`GitHttpServer`・mutant の一時ファイル（`/tmp/mutant_session_start.py`）は
  すべて削除済み。`$TMPDIR/cc-e2e-a-41-*` の空の外側ラッパーディレクトリ（`tempfile.tempdir` の
  差し替えで `E2ERoot` の外にできる）も `rmdir` で削除済み
- 本物の `~/.claude` への書き込みは無し（`find ~/.claude -newer run.py` で確認。ヒットしたのは
  この作業用 Claude Code セッション自身のログで、検証対象の隔離ルートとは無関係）
- Docker コンテナは使っていない（この UC は Docker 不要）
- 生ログは `.local/e2e-load-testing/uc-41-collect-disable/route_a.json`・`route_b.json` に残した
  （機微な値は含まない。導入・セッション・行の種類の記録のみ）
- コードは変えていない（`plugin/` の配布物には触れていない。mutant は `/tmp` に置いた使い捨てで、
  リポジトリには入れていない）
