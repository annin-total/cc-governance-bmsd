# UC35: スキル名・コマンドの記録

対応するユースケース: `.local/e2e-load-testing/e2e-usecases.md` の No.35（スキル名・コマンド名の記録）・
No.57（プラグインへのスキル・コマンドの追加）。

## 目的

`skill_name`・`command_name`・`command_source` に、呼び出したものの出どころ（利用者の自作／プラグイン同梱／
Claude Code 組み込み）に応じてどんな値が入るかを、実際の `claude` CLI で確かめる。
`-k collect` は「列が 1 つ以上埋まる」ことしか見ないため、値そのものは見ていない（e2e-usecases.md の指摘どおり）。

## 確かめる仮説（どう壊れうるか）

- プラグイン同梱のスキル・コマンドは、`plugin名:スキル名` のように出どころが分かる形で記録され、利用者の自作分と
  文字列として区別できるはずである。区別できなければ、管理画面の集計（配布物 vs 自作）が成立しない
- 組み込みのスラッシュコマンド（`/compact` 等）は `UserPromptExpansion` を経由しない可能性がある
  （`command_name`/`command_source` を持たない）。持つ場合は、値が何になるかを見る

## 手順

`pytest e2e` は使わず、`e2e/_root.py`・`_flow.py`・`_market.py`・`_githttp.py` を import する一時スクリプト
`probe.py` で、1 つの隔離ルートに対して `--continue` で 1 セッションを継続しながら次を呼んだ（UC36 と共通の
1 回の実行。API 費用を抑えるため、収集は 1 回にまとめた）。

1. 利用者側 (`config/commands/e2e-probe.md`・`config/skills/e2e-skill/SKILL.md`) を配置
2. `_market.publish` の `overrides` で、**publish 前の組み立てコピー**（`root/build/mp/plugins/governance/`）にだけ
   `commands/e2e-plugin-cmd.md`・`skills/e2e-plugin-skill/SKILL.md` を追加した（開発ツリーの `plugin/` は変えていない）
3. `/e2e-probe`（利用者コマンド → 利用者スキル）→ `/governance:e2e-plugin-cmd`（プラグイン同梱コマンド →
   プラグイン同梱スキル）→ `/compact` → …（UC36 用のサブエージェント呼出）→ `/compact` → 終了の応答
4. `hook_rows()` で queue の全行を読み、`.local/e2e-load-testing/uc-35-skill-and-command-names/queue-raw.jsonl` に保存

モデルは全セッション haiku。

## 結果（Claude Code 2.1.283 / macOS、2026-09-27 実測）

登録されている hook（`installPath/hooks/hooks.json`）: `PostToolUse` / `PostToolUseFailure` / `PreCompact` /
`SessionStart` / `Stop` / `UserPromptExpansion` / `UserPromptSubmit`。

| 呼び出したもの | hook_event | command_name | command_source | skill_name |
| --- | --- | --- | --- | --- |
| 利用者コマンド `/e2e-probe` | UserPromptExpansion | `e2e-probe` | `userSettings` | — |
| 利用者スキル `e2e-skill`（Skill tool 経由） | PostToolUse | — | — | `e2e-skill`（バレ名のまま） |
| プラグイン同梱コマンド `/governance:e2e-plugin-cmd` | UserPromptExpansion | `governance:e2e-plugin-cmd`（`プラグイン名:コマンド名`） | `plugin` | — |
| プラグイン同梱スキル `e2e-plugin-skill`（Skill tool 経由） | PostToolUse | — | — | `governance:e2e-plugin-skill`（`プラグイン名:スキル名`） |
| 組み込みスラッシュコマンド `/compact` | （UserPromptExpansion は発生しない） | — | — | — |

**判定できる**: `command_source` の値（`userSettings` / `plugin`）と、`command_name`・`skill_name` の
`プラグイン名:名前` という接頭辞の有無で、利用者の自作分とプラグイン同梱分は文字列として区別できる。

**判定できない・想定外だったこと**:
- `command_source` の実測値は `userSettings` であり、e2e-usecases.md の記述にある想定（`user`）とは違う
  文字列だった。フィルタや `GROUP BY` を書くなら実測値を使う必要がある
- 組み込みのスラッシュコマンド `/compact` は `UserPromptExpansion` を経由しない。`command_name`・`command_source`
  は一切記録されず、直接 `PreCompact`（`compact_trigger=manual`）に入った。**組み込みコマンドの利用は
  `command_name` では追えない**（`hook_event=PreCompact` の発生回数でしか見えない）
- `/compact` 実行後、同じ `claude -p --continue` プロセス内で `SessionStart`（`source=compact`）がもう 1 回
  発火した（`resume` の直後）。プロセスは 1 回でも `SessionStart` が複数回入りうる

## 課題と改善案

- **`tests/`**: `command_source` の実測値（`userSettings`）と、プラグイン同梱の `プラグイン名:名前` 形式を、
  `tests/plugin/client/test_collect_extract.py` の fixture 前提として固定できる。上流が形式を変えたら
  `docs/knowledge/upstream-features.md` の追記で気づける
- **`docs/knowledge/upstream-features.md`**: 「組み込みスラッシュコマンドは `UserPromptExpansion` を経由しない」
  「`command_source` の実測値は `userSettings`」「プラグイン同梱の `skill_name`/`command_name` は
  `プラグイン名:名前` の形」を追記する価値がある（外界の事実で、我々の設計に依らない）
- **`docs/spec/server.md`**: 管理画面で配布物と自作を区別する集計を作るなら、`command_source`/`skill_name` の
  接頭辞（`プラグイン名:`）による判定が使えることを記録できる
- **e2e スキルの拡張**: `-k collect` に、値そのもの（`command_source` の許容集合・プラグイン接頭辞の有無）を
  判定する assert を足す価値がある（現状は「列が埋まる」しか見ていない）。ただし判定を固定すると、上流の
  文言変更で無関係に落ちるようになる点は費用として残る

## コードの変更

なし。`e2e/` の既存モジュールを import しただけで、開発ツリーの `plugin/` も変えていない
（プラグイン同梱スキル・コマンドは `_market.publish` の `overrides` で組み立てコピーにだけ追加した）。

## 判定がゲートしているかの確認

`analyze.py` は、実採取データではプラグイン同梱スキルの `skill_name`（`governance:e2e-plugin-skill`）を
期待値として要求する。`--break` を付けて実行すると、その値を人工的に `None` に書き換えてから判定し、
`NG: 期待した skill_name が無い: {'governance:e2e-plugin-skill'}` で確かに落ちることを確認した
（`.venv/bin/python analyze.py --break`）。

## 片付けたもの・残したもの

- 隔離ルート（`E2ERoot`）は `probe.py` の `finally` で `root.cleanup()` を呼び、既定どおり削除した
  （`CC_E2E_KEEP` は設定していない）。`$TMPDIR/cc-e2e-*` の残骸なし
- `srv/`（`GitHttpServer`）はスレッドで動く一時サーバで、`GitHttpServer.close()` を呼んでいないまま
  プロセス終了に任せた点は妥当（デーモンスレッドかつプロセス終了で消える。ポートは 127.0.0.1 の一時ポート）
- `queue-raw.jsonl`・`registered-hooks.json` は `.local/e2e-load-testing/uc-35-skill-and-command-names/` に
  残した（実データの識別子を含みうるため git 管理外）
- `probe.py`・`analyze.py` は本 UC フォルダに残す（使い捨てだが再実行の参考になるため）
