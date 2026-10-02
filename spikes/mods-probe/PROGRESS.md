# mods-probe 進捗記録

Mods（関数フック、Claude Code v2.1.287 で GA）を governance プラグインに使えるかを判断するための検証の記録。
一時的な記録であり、判断が済んだら残す事実だけを `docs/` に移す。

## 前提

- Claude Code 2.1.287（`claude --version` で確認）
- ブランチ `spike/mods-sample`（`development` から分岐）、worktree `bmsd-governance/work/wt-mods-sample`
- 本番の受信先には送らない。送信の検証は localhost の使い捨て受信器で行う
- 実機検証は `--plugin-dir` で読み込む（そのセッション限り）。利用者本人の `settings.json` は書き換えない

## 検証する観点（governance プラグインの用途との対応）

| # | Mods の機能 | 現行の対応物 | 確かめること |
|---|---|---|---|
| 1 | `session.start` ＋ `$.ui.toast` | SessionStart hook の通知 | 起動時に通知が出るか |
| 2 | `$.command.register` ＋ `command.run` | スキル `/reapply` | スラッシュコマンドが使えるか |
| 3 | `prompt.submit` / `tool.call` の観測 | UserPromptSubmit / PostToolUse(Failure) | 回数とエラーを数えられるか |
| 4 | `tool.call` の `{ deny }` ＋ `.catch` | （PreToolUse 相当のガード） | 拒否とフェイルクローズ |
| 5 | `turn.complete` の `e.usage` | Stop hook での transcript 解析 | トークン数を直接取れるか |
| 6 | `classic.Stop` | 既存の settings hook | 併走して `next(e)` で既存 hook を止めないか |
| 7 | `$.store` ＋ `$.http.fetch` ＋ `$.clock.every` | spool ＋ sender | 貯めて送れるか、送信失敗で止まらないか |
| 8 | `$.ui.status` ＋ `$.session.usage()` | statusline.js | 外部プロセスなしで状態行を出せるか |
| 9 | `ui.render`（AbovePrompt）＋ `$.state` | なし（新規） | バンドの表示と操作 |
| 10 | `userConfig` | config.json | 設定値の受け渡し |
| 11 | `-p`（非対話）での発火 | CLAUDE_CODE_ENTRYPOINT での判別 | 非対話でも hook が動くか |

## ワークフロー

| 段階 | 内容 | 担当 | 状態 |
|---|---|---|---|
| 1 | worktree・ブランチ作成、バージョン確認 | 監督 | 済 |
| 2 | mod の実装、`claude plugin validate`、`tsc`、`claude plugin test` | 監督 | 済（5/5 合格） |
| 3 | 変異検査（実装を壊してテストが落ちるか） | 監督 | 済（M1〜M5 検出、M6 未検出） |
| 4 | M6（`.catch` 除去）を検出するテストの追加 | サブエージェント | 済（470f68c、6/6 合格、M6 検出） |
| 5 | 非対話（`claude -p --plugin-dir`）での実機検証 | サブエージェント | 済（8 観点 OK、送信失敗時の欠陥 1 件） |
| 5b | `$.http.fetch` の例外を捕まえる修正とテスト | サブエージェント | 済（3d2aa0b、7/7 合格、変異で検出） |
| 6 | 対話（tmux 上の `claude --plugin-dir`）での実機検証 | サブエージェント | 済（9 観点 OK、5b の修正を実機確認） |
| 7 | 検証結果の文書化（`RESULTS.md`） | サブエージェント | 済（9f8a634、監督がログと突き合わせ） |
| 8 | 監督によるレビュー、PR 作成 | 監督 | 済 |

## 記録

- 2026-10-02 worktree を誤って 1 階層上（`Development/work/`）に作成していた。mod は worktree 外に書かれていたため、
  変異検査の巻き戻し（`git checkout`）が失敗し変異が累積した。手で戻してテスト合格を確認し、`git worktree move` で正しい位置へ移した。
  以後、変異検査は巻き戻しの成否を確かめてから次へ進む
- 変異検査の結果（コミット 0eafc5d 時点）

  | 変異 | 結果 |
  |---|---|
  | M1 ガードの判定を常に偽にする | 検出 |
  | M2 送信後にバッファを空にしない | 検出 |
  | M3 Hide を効かなくする | 検出 |
  | M4 キャッシュ読み取りトークンを取り違える | 検出 |
  | M5 送信先が空でも送る | 検出 |
  | M6 ガードの `.catch` を外す | **未検出**（validate も通る） |
- 段階 5 の要点（詳細は `RESULTS.md`）
  - `$.http.fetch` は接続拒否で **例外を投げる**（`ok:false` ではない）。捕まえないと hook が skip され、コマンドの応答が
    「no command.run hook answered it」という誤解を招く文言になる。セッションは壊れず、buffer も残る → 段階 5b で修正
  - `$.store` は `~/.claude/plugins/store/<plugin>_<id>-<hash>.json` の 1 ファイル。`-p` のプロセスを跨いで残る
  - `--plugin-dir` で読むと、エンジンが mod 直下に `tsconfig.json` を書く。`tsc -p .` がそのまま通るのでリポジトリに含める

## 第 2 段（未検証事項のうち、この Mac で今すぐ確かめられるもの）

方針: 本物の `~/.claude` は書き換えない方法を優先する（`--plugin-dir`・`--settings`・隔離 `CLAUDE_CONFIG_DIR`）。
書き換えが必要になったら、先に `~/.claude` 全体の複製を取る。この Mac では確かめられないもの（Bedrock 認証、Windows、
Desktop・VS Code、managed settings）は対象外。

| 段階 | 内容 | 担当 | 状態 |
|---|---|---|---|
| 9 | G1（`-p`、実 config）: ツール失敗の計数、サブエージェントのターンと usage、localhost 以外への fetch、`disableAllHooks`、利用者の mod による classic hook の握り潰し・改変、`$.store` の並行書き込み、`e.usage` と transcript の usage の一致 | サブエージェント | |
| 10 | G2（隔離 config、未ログイン）: ローカルのマーケットプレイス経由の導入、キャッシュと本体の書き込み、版の更新、ユーザー設定の `prependPlugins` | サブエージェント | |
| 11 | G3（対話、tmux）: ホットリロード | サブエージェント | |
| 12 | 結果の追記、`docs/` への昇格 | サブエージェント・監督 | |
