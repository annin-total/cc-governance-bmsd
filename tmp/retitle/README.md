# セッションタイトル自動リネーム（retitle）

作業の趣旨が変わったら、Claude Code のセッションタイトルを「要約 · ブランチ」に付け直す個人用の hook と、その導入スキル。
本プラグイン（`plugin/`）とは無関係で、配布物にも含まれない。

| パス | 役割 |
| --- | --- |
| `settings-excerpt.json` | macOS で手で入れていたときの `settings.json` の抜粋（シェル形式。参考） |
| `setup-retitle/` | 配布するスキル。`~/.claude/skills/` に置き、Claude に「retitle を入れて」と頼む |
| `setup-retitle/scripts/retitle.py` | hook 本体（macOS・Linux・Windows） |
| `setup-retitle/scripts/install.py` | 導入・確認（`--check`）・削除（`--uninstall`） |
| `setup-retitle/assets/retitle-skill.md` | `/retitle` の雛形。導入時に Python と hook のパスを埋めて置く |
| `tests/test_retitle.py` | 単体テスト（`python3 -m unittest discover -s tmp/retitle/tests`） |

## 仕組み

- `UserPromptSubmit` の hook が、15 字以上の送信のたびに裏で `claude -p --model haiku` を起動し、主題が変わったかを判定させる。
  結果は `~/.cache/cc-retitle/` に置かれ、**次の送信**で `sessionTitle` として返される（判定に数秒かかるので、送信を待たせないため）
- 導入スクリプトは、hook を exec form（`command` に Python の絶対パス、`args` にスクリプト）で登録する。
  シェルを介さないので、macOS の `sh`、Windows の Git Bash・PowerShell のどれでも同じ登録で動く（Claude Code 2.1.139 以降）
- Windows では、判定のプロセスを `CREATE_NO_WINDOW`・`CREATE_NEW_PROCESS_GROUP`（許されれば `CREATE_BREAKAWAY_FROM_JOB` も）で切り離す。
  標準入出力は UTF-8 で読み書きし、hook の出力 JSON は ASCII に限る（コンソールの文字コードに左右されないため）

## 配布

`setup-retitle/` のフォルダごと、相手の `~/.claude/skills/setup-retitle/` に置いてもらう（Windows は `%USERPROFILE%\.claude\skills\setup-retitle\`）。
Claude Code を起動し、「セッション名を自動で付け直す仕組みを入れて」などと頼めばよい。Python 3.8 以上（venv の外）と、`PATH` の通った `claude` が要る。

## Windows での確認（未検証）

Windows の実機では確かめていない。Windows を使う人に、次を頼む。

1. 上の「配布」のとおりに導入し、`python install.py --check`（スキルが実行する）が全部 `OK` になる
2. Claude Code を起動し直し、15 字以上の依頼を送る。数秒後にもう一度送ると、タイトル（ターミナルのタブ名と `/resume` の一覧）が変わる
3. 送信のたびに黒いコンソール窓が出ない
4. 変わらなければ `%USERPROFILE%\.cache\cc-retitle\error.log` を見る。何も無く、`%USERPROFILE%\.cache\cc-retitle\` に `<セッション ID>.json` もできていなければ、
   判定のプロセスが Claude Code と一緒に終了させられている可能性がある（切り離しの不足）
