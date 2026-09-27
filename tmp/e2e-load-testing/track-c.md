# トラック c（収集と上流の事実）の要約

対象: Claude Code 2.1.283、macOS（Apple M2・8 コア・8 GiB）、hook の python3 は 3.13.2（pyenv のシム経由）。
この Mac の時間の数字は本番の性能を表さない（相対比較のみ）。詳細は各 `uc-*/notes.md`。

## UC ごとの結果

| UC | 結果（1 行） |
| --- | --- |
| 31 | `-k collect` は hook の追加・キーの改名・`json.py` の隠蔽をすべて落とす。ただし `json.py`/`uuid.py` を `plugin/hooks/` に置くと hook は exit 0・queue 0 行・error 行 0 の完全な無言で壊れ、`validate_plugin.py` は合格にする。`PermissionDenied` は `-p` では発火せず（`PermissionRequest` は発火）。概況の NULL 率は 4 列だけで、多くのキー消滅が画面に出ない |
| 55 | 契約違いの旧版 4 端末と新版 1 端末の同時送信で、行はほぼ DB に入る。欠けた列は NULL、余分な列は捨てられる（無言）。`ts` を改名した版の event 行は全損し、サーバは 200 を返し端末は spool を消すため、どこにも残らない。版の分布は (user_email, host) の最新 1 行で数えるため 5 端末が 1 台に潰れる。版を上げない再 publish は `plugin update` で届かず警告も無い（uninstall→install なら入る） |
| 38 | 12 シナリオ（プロンプト・Bash・Read/Write・パス・ツールのエラー・サブエージェント・長い出力・コマンド引数・/compact・例外）×4〜5 並行×2 回で、queue・spool・POST の生バイト・サーバ DB・docker logs に本文・中身・パス・エラー文は 0 件（断片・エスケープ形も 0）。陽性対照 4 種は検出。送る利用者の値は管理対象キーの以前の値（policy 行の `prev_value`、最大 255 文字）だけ |
| 43 | hook の処理自体は 30〜60 ms、SessionStart の全段で約 80 ms。遅延の主因は pyenv のシム（呼出ごとに約 0.39 s。未ログインの `-p ok` はなし 0.80 s／あり 1.96 s／シム回避 1.01 s、中央値 20 回）。高負荷（load 36〜47）ではシム経由の hook が最大 5.95 s で 5 秒のタイムアウトを超えた。送信の切り離しは起動を待たせない |
| 35 | 同梱のスキル・コマンドは `governance:<名前>`・`command_source=plugin`、利用者のものは素の名前・`command_source=userSettings` で区別できる。組み込みの `/compact` は `UserPromptExpansion` を通らず `command_name` に残らない |
| 36 | `context_tokens` は `PreCompact`・`Stop` だけで入る（9/9）。`agent_id` はサブエージェントのツール呼出にだけ付き、呼出ごとに別の値で親子を区別できる。Agent を使ったターンで `Stop` が 2 回ずつ記録された（5 ターンで 7 回。サブエージェント境界の Stop という解釈は推定で、再現は未確認） |

## 最も重要な発見 3 つ

1. **無言の全損が 2 経路ある。**(a) `plugin/hooks/` に標準ライブラリと同名のモジュール（`json.py` 等）を置くと、hook は exit 0 のまま何も書かず、error 行も残らない。`validate_plugin.py` は通す（UC 31）。(b) 必須列 `ts` の改名など受信側が破棄する行は、サーバが 200 を返すため端末の spool から消え、error 行にも概況にも出ない（UC 55）。どちらもリリースを止めるべき種類の失敗で、検査の追加（stdlib 名の禁止・hook 実行で行が増えることの確認・破棄件数の可視化）が要る
2. **概況の健全性の表は上流のキー消滅をほとんど映さない。**NULL 率は 4 列だけで、分布の表は NULL を数えない。`skill_name` は分母が `tool_name='Skill'` なので `tool_name` が消えると 0.0% のまま隠れる。版の分布は端末を潰して数える（UC 31・55）
3. **「起動が遅い」の主因は hook の処理ではなく `python3` の解決（pyenv のシム）で、高負荷では 5 秒のタイムアウトに届く。**問い合わせ対応では `command -v python3` と `time python3 -c pass` を先に確かめる（UC 43）。あわせて、非漏洩は拡張したシナリオでも保たれた（UC 38）

## 課題・改善案の所在

各 `uc-*/notes.md` の「課題と改善案」に、`e2e/`・`docs/guide/e2e.md`・e2e スキル・`docs/knowledge/` に分けて書いた。主なもの:
- `e2e/`: `test_leak.py` にシナリオ（Read・パス・ツールのエラー・コマンド引数）と走査（POST 生バイト・断片）を足す。`test_collect.py` の行 0 件時に import 失敗を示すメッセージ。`prompts.json` に権限の要求を起こす手順
- `scripts/validate_plugin.py`: `sys.stdlib_module_names` との衝突を不合格に、hook 実行で queue が増えることを確認
- サーバ: 破棄した行を可視化、NULL 率の対象を契約の全列へ、版の分布のキーを仕様として明記
- `docs/knowledge/`: PermissionRequest/PermissionDenied の `-p` での発火（2.1.283）、`plugin update` が版だけで判定すること、`command_source` の実値、サブエージェントと Stop の件数、pyenv のシムの遅延
- 未確認の論点: 送信プロセスに排他が無く同じ spool を重ねて送りうる（UC 43 の副次観測。計測で `sent_at` を消した条件での推測）

## 片付けの状況

- `cc-e2e=c` の Docker コンテナ・イメージ: 0 件
- `$TMPDIR/cc-e2e-*`（自トラック）: 0 件。起動したプロセス: 残りなし
- heavy.lock: UC 38 の間だけ取得し、解放済み（要約を書いた時点で在る heavy.lock は他トラックのもの）
- 開発ツリーの `plugin/`・`e2e/`・`server/`: 変更なし（検証中の変更はすべて戻した）
- 生データ（queue・DB・ログ）は git 管理外の `product/cc-governance-bmsd/.local/e2e-load-testing/uc-*/` に残した
- API 費用（概算）: 合計 約 1.3〜2 USD
