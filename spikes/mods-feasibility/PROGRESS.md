# mods-feasibility 進捗記録

governance プラグイン（`plugin/`）を Mods 基盤へ移す前に、今の機能ごとに Mods で実現できるかを実機で確かめ、
対応表と補完手段を確定させるための作業の記録。一時的な記録であり、残す事実は `docs/` に移す。

## 前提

- Claude Code 2.1.288（前段の検証 `spikes/mods-probe/` は 2.1.287）。macOS、Claude.ai 認証
- ブランチ `spike/mods-feasibility`（`spike/mods-sample` から分岐。PR #107 は未マージ）。
  worktree `bmsd-governance/work/wt-mods-feasibility`
- 不変条件: 契約（サーバが受け取る内容）は変えない。機能の後退は認めない。改善は歓迎し、Mods で新たにできることは採る。
  見え方が変わる箇所は機能ごとにユーザーへ質問する（一括承認にしない）
- 握り潰しは、対処できるなら対処する。対策の効き方と外され方を実機で確かめる
- 改善候補は、実現できるかを実機で確かめる
- ユーザーの手動検証（Bedrock・Windows・社内 Bitbucket）は手順書を渡し、結果は待たない
- 本番の受信先には送らない。本人の `~/.claude` の設定は書き換えない（`--plugin-dir`・`--settings`・隔離 `CLAUDE_CONFIG_DIR`）
- プラグイン本体（`plugin/`）・サーバ・契約（`contract.py`）は変更しない

## 検証する観点

洗い出し（段階 2）の後に、機能ごとの行へ置き換える。

| 観点 | 確かめること |
|---|---|
| 収集 | 契約の全項目を mod から取れるか。settings hook 無しで `classic.*` が発火するか。`UserPromptExpansion`・`PreCompact` の入力 |
| コンテキストトークン数 | `$.session.usage().context` が契約の定義と一致するか |
| 蓄積と送信 | spool 上限・オフライン時の保持・`$.store` の容量・終了直前の送信・認証ヘッダ |
| 設定の自動適用 | `settings.json` を書けるか・壊れた JSON・読み込み中の書き換え・効くタイミング |
| お知らせ・状態行・`/reapply` | 同等にできるか。改善候補が成り立つか |
| 識別子 | 同じ値を導けるか |
| 握り潰しの対策 | governance 自身を prepend に置く・守りの mod・managed settings の効き方と外され方 |
| 配布と更新 | git 型マーケットプレイスでの実行元・更新の反映・型ファイルの書き込み |
| 版の差 | 2.1.287 での結果が 2.1.288 でも成り立つか |

## ワークフロー

| 段階 | 内容 | 担当 | 状態 |
|---|---|---|---|
| 1 | すり合わせ、worktree・ブランチ作成、進捗記録 | 監督 | 済 |
| 2 | 機能の洗い出し（対応表の行と、契約の項目ごとの取得元） | サブエージェント | 済（INVENTORY.md。主要な主張は監督が型定義で照合） |
| 3a | 握り潰しの対策の実機検証 | サブエージェント | 済（025bdc1。順序・fetch の偽装・守りの効果を監督が debug と受信器の記録で照合） |
| 3b | git 型マーケットプレイスの実行元・更新の実機検証 | サブエージェント | 済（f505e57。実行元が cache・版を上げないと届かないことを監督が応答の記録で照合） |
| 4a | 収集・コンテキストトークン数・識別子の実機検証 | サブエージェント | 済（199754f。件数の一致と中断時の差を監督が記録ファイルで照合） |
| 4b | 蓄積と送信の実機検証 | サブエージェント | 済（490b863。切り離した送信の ppid=1 での 200・延長時の予算 8000ms を監督が記録で照合） |
| 4c | 設定の自動適用の実機検証 | サブエージェント | 済（fea5477。上書き中の混在 12・欠け 15 件と ConfigChange による読み直しを監督が記録で照合） |
| 4d | お知らせ・状態行・`/reapply` の同等性と改善候補の実機検証 | サブエージェント | 済（5efb439。トーストの切り詰め・`/governance:reapply` の拒否・80 列でペインが出ないことを監督が capture と debug で照合） |
| 4e | 独自イベント（classic.* 以外）での収集と、sec-default の下で届くかの実機検証 | サブエージェント | 済（e8a7052。m1〜m4 で sec-default が座り、独自イベントは届き classic・skill.prompt だけ飛ばされたことを監督が debug と記録の件数で照合） |
| 5 | 対応表と補完手段の統合、見え方が変わる機能ごとのユーザー確認 | 監督 | 済（FEASIBILITY.md。決定と未決を反映） |
| 6 | 手動検証の手順書 | サブエージェント | 済（c86bc54、manual/。validate --strict と plugin test 6/6 を監督が隔離 config で再実行） |
| 7 | docs（knowledge・remaining）への反映、次のハンドオフの更新、PR | 監督 | 済（e252ba0。PR #108。ハンドオフ 2 の前提を更新） |

## 記録

- 2026-10-03 すり合わせの結果を「前提」に記録した
- 段階 2 の結果、型定義（2.1.288）で次を監督が確認した: classic.* は settings hook が無くても発火する（L1064）、
  ClassicResult に `systemMessage` が無い、`$.fs` は read・write・list・exists・stat・ancestors だけ（rename・delete・append が無い）、
  `$.settings` は読むだけ、`session.end` は全体で既定 1.5 秒、HttpInit に timeout が無い、`$.process.spawn` の子はモジュールの解放で殺される。
  原子的な置き換え・削除・本体終了後の送信が補完の焦点になる
- 3b: ローカルの bare パスと `file://` は git 型として登録できない（前者はディレクトリ扱い、後者は形式エラー）。dumb HTTP は shallow clone を受けない。
  使い捨ての smart HTTP（`git http-backend`、localhost）で配って検証した
- 3a: 本物の managed settings はこの Mac では試せない（`CLAUDE_CODE_MANAGED_SETTINGS_PATH` は効かない。隠しフラグ `--managed-settings` は
  restrictive-only で prependPlugins などを落とす）。managed の効き方は会社 PC の手順書に回す
- 4a: 比較用プラグインが `_context` を import して `plugin/hooks/__pycache__/` を作った（追跡外）。担当が削除し、以後は `sys.dont_write_bytecode` で防いだ
- 4b の追加: `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` は公式 docs に無い。公式は「SessionEnd の settings hook の timeout で予算を最大 60 秒に上げる」。
  これが mod の session.end にも効くかを追加で確かめる
- 公式 docs（mods/reference.md）: `$.fs.write` は原子的でないと明記。利用者 settings の `prependPlugins` は、managed settings が無く
  Team・Enterprise でサインインしていない端末でだけ効く
- 4c: 担当が `claude plugin validate --strict` を 1 回隔離せずに実行した（本人の settings.json の md5 は不変）
- 4b の追加: SessionEnd の予算は、`--settings` に書いた SessionEnd hook の timeout で上がった（timeout 30 で打ち切りが 31.48 秒、
  120 でも 60 秒で打ち切り）。プラグインの hooks.json の SessionEnd hook では上がらない（0bfb00c）。`next.budget.ms` の 10000 は
  上限そのものではなく、hook 1 回の予算との小さい方。user・project・managed の settings に置いた場合は未検証
- 2026-10-03 ターミナルの終了で監督のセッションが中断した。4d は報告書（scratch/g4d/REPORT.md）とコミット 5efb439 まで済んでおり、
  子プロセス・tmux の残りは無かった。再開後に監督が報告書を生データで照合した
- 段階 5 の下書き（f4cdf5d、FEASIBILITY.md）を受け、ユーザーと機能ごとに次を決めた
  - お知らせ: AbovePrompt のバンドに出し、リンクと「既読にする」ボタンを付ける。既読はボタンを押したとき。ブラウザ起動は今のまま残す
  - `/governance:reapply`: mod のコマンド `/governance-reapply` にする（モデルを呼ばず、表で出す）
  - 状態行: settings の statusLine と statusline.js を残す
  - Esc で中断したツールの PostToolUseFailure の行が増えることを受け入れる
  - 設定の自動適用: 判定・JSON の生成・policy 行は mod、書き込み・原子的な置き換え・0600 のバックアップだけ同梱の Python
  - 送信: 今と同じ一括送信（SessionStart と Stop の時点で 10 分以上たっていれば）。送るのは切り離した Python。mod は判定と起動
  - claude_code_version は全イベントに入れる
  - 握り潰し: managed settings が無い端末では、prependPlugins に governance を置き、守りの mod と検知を足す。
    managed settings がある端末では sec-default に任せる。会社 PC の managed settings の有無を確かめて確定する
- 3a の生ログ（m3）で、sec-default が座ると利用者 tier の mod に classic.* と settings.read が届かないことを監督が確認した。
  prompt.submit・session.start・http.fetch は届く。classic.* に頼る収集は managed settings のある端末で成り立たないため、
  独自イベントでの収集を 4e で確かめる
- 4e: 独自イベント（tool.call・turn.*・session.*・prompt.submit・command.run）と `$` の API は sec-default の下でも利用者 tier に届く。
  列は session_id・tool_name・compact_trigger・command_name・skill_name・agent_id・context_tokens が一致。prompt_id・permission_mode は
  transcript の user 行から読む条件付き、source・is_interrupt・command_source は組み立てる条件付き、effort_level は未検証
- 追加の決定: error_type は抜き出した符号（ECONNREFUSED など）と JS の例外名にする（`HTTP <コード>` は今のまま）。prev_value の数値は
  JS の表記でよく、差を設計書に記録する。手動検証の資材は GitHub のこのブランチから会社 PC で取得する
- 追加の決定（2 回目）: 収集の土台は独自イベント。設定の自動適用は前の決定を改め、適用を丸ごと同梱の Python が行い、mod は起動と
  policy 行の組み立てだけを担う（利用者の settings.json の表記を変えない・規則を 2 か所に持たない）。送信の error 行は Python が今の名前で積む。
  -p のお知らせは `$.ui.log`
- ユーザーの以前の会社 PC での検証（2026-10-02、2.1.287、Bedrock）: mod は読み込まれて動く。managed settings は無く、sec-default は座らない。
  2.1.285 では resume で SessionStart の systemMessage が表示されなかった。ONCE の dict は利用者の元の値を丸ごと置き換える（既知の問題として引き継ぐ）
- 段階 6: 担当が隔離 config の初回の対話で「ターミナル設定」を Yes にし、本体が本人の Cursor の設定ディレクトリに
  `keybindings.json.<hash>.bak` を作った（元のファイルは不変、bak は同一内容）。ダミーの Bedrock 設定で起動した回に、本体が AWS の資格情報の
  解決を試みて失敗した（モデルは呼ばれていない）。手順書には「ターミナル設定は No」と書いた
