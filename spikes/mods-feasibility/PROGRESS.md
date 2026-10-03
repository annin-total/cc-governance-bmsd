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
| 4d | お知らせ・状態行・`/reapply` の同等性と改善候補の実機検証 | サブエージェント | 実行中 |
| 5 | 対応表と補完手段の統合、見え方が変わる機能ごとのユーザー確認 | 監督 | 未 |
| 6 | 手動検証の手順書 | サブエージェント | 未 |
| 7 | docs（knowledge・remaining）への反映、次のハンドオフの更新、PR | 監督 | 未 |

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
