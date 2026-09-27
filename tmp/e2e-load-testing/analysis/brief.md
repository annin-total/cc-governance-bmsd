# 精査の共通指示（調査担当・レビュー担当）

リポジトリ: `/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/cc-governance-bmsd`（ブランチ `e2e-load-testing`）。**読むだけ。ファイルを変更しない・コミットしない・テストや claude を実行しない**（静的な確認に限る。確かめるための軽い grep や python の読み取りは可）。

## 背景
2026-09-27 に実機負荷テスト 22 UC を 3 トラックで行い、`tmp/e2e-load-testing/report.md`（最終報告書の初版）にまとめた。一次情報は `tmp/e2e-load-testing/uc-*/notes.md`（と同じフォルダのスクリプト）。1 回の報告書づくりでは取りこぼし・誤りがありうるので、領域ごとに精査する。

## 領域（目的単位。MECE）
| 領域 | 守るもの | 主な UC | 主なコード・文書 |
| --- | --- | --- | --- |
| D1 設定の配布と端末の状態 | 利用者の settings.json・配布値の適用と撤回・お知らせ・導入と撤去 | 01・06・12・13・14（書き込み）・24・41・60 | `plugin/hooks/_settings.py`・`_policy_ops.py`・`policy.py`・`session_start.py`・`_notices.py`・`_browser.py`・`_govdir.py`・`docs/spec/plugin.md`・`docs/decisions/plugin.md`・`docs/guide/release.md` |
| D2 収集と上流の事実 | hook の発火・収集する値・本文を送らないこと・hook の処理時間 | 31・35・36・38・43・55（端末側） | `plugin/hooks/collect.py`・`contract.py`・`hooks.json`・`scripts/validate_plugin.py`・`docs/knowledge/`・`docs/spec/plugin.md` |
| D3 送信・蓄積・回復 | 端末から集計サーバまで届くこと・失ったら分かること | 46・47・50・14/77（SessionStart の打ち切り）・55（送信側） | `plugin/hooks/_sender.py`・`_spool.py`・`session_start.py`・`config.json`・`docs/spec/plugin.md` の「蓄積と送信」 |
| D4 集計サーバ（受信・取込・画面・DB） | 受け取った行と CSV が正しく保存・集計・表示されること | 32・39・55（受信側）・68・76・77（受信側） | `server/ccgov/`・`server/entry.sh`・`server/tests/`・`docs/spec/server.md`・`docs/decisions/server.md` |
| D5 検証の仕組み | E2E・`e2e.md`・e2e スキル・並行検証の運用が、変更を確かめる力を持つこと | 全 UC の「E2E の穴」と 5 章の所見 | `e2e/`・`docs/guide/e2e.md`・`.claude/skills/e2e/`・`tmp/e2e-load-testing/strategy.md`・`track-*.md`・`progress*.md` |

## 調査担当がすること
1. 担当 UC の `notes.md` を全部読み、報告書の該当箇所と突き合わせる
2. 各発見を、**今のコードと文書で裏を取る**（行番号を示す）。notes の誤り・報告書の誤り・誇張・取りこぼしを見つける
3. 改善案を、設計見直し・仕様・バグ修正・テスト・文書・性能・運用・知識（docs/knowledge）の観点で**多角的に**出す。水増ししない。1 項目は短く、優先度（P1＝リリース前／P2＝運用開始後早め／P3＝あれば良い）と根拠（UC とファイル:行）を付ける
4. 領域をまたぐものは「他領域へ」の欄に書く（重複して詳述しない）

## 調査結果の書式（返答の本文として。区切り線の間をそのまま保存する）
----- BEGIN <領域> -----
# <領域名> の精査
## 1. 結論（5 行以内）
## 2. 発見の検証（表: 発見・UC・判定［裏付けあり/一部誤り/誤り/未確認］・根拠（ファイル:行）・報告書の要修正点）
## 3. 取りこぼし（報告書に無いが notes や実装から分かる重要事項）
## 4. 改善案（表: ID <領域>-NN・観点・内容（短く）・優先度・根拠）
## 5. 現在の文書・実装との不整合（表: 箇所・内容・直し方）
## 6. 他領域へ・未確認のこと
----- END <領域> -----

## レビュー担当がすること
調査結果を敵対的に検証する。根拠のファイル:行を実際に開いて確かめ、誤り・誇張・取りこぼし・優先度の誤り・水増し（同じ内容の言い換え）を指摘する。notes.md とも照合する。返答は表（指摘・重大度［要修正/推奨/軽微］・根拠・直し方）と、全体の評価 3 行。

## 利用者の方針（改訂で必ず守る）
- **厳格にしすぎない。**過剰な厳格性は妥当な範囲で捨てる設計である（YAGNI）。`docs/decisions/` で受け入れた損失や限界は蒸し返さず、「受け入れ済み」と書くだけにする。直すのは、仕様の意図どおりに動いていない単純なバグと、全停止・リリースを止めるものに限る。P1 は「リリース前に入れないと実害が出る」ものだけにする
- **CSV は疎結合で任意。**ガバナンスサーバはログ収集が本体で、CSV は「あれば、より正確に表示できる」補強である。CSV が無くても全機能が動作・表示・テストできることを守る。CSV を前提にした改善案は、その前提を明示し、優先度を下げる。CSV の取込の厳密化（損失の検出など）も、この方針に照らして必要十分かを見直す
- **hook のタイムアウト**について、利用者は 10〜30 秒への延長を許容する（普段は 5 秒以内で、超えるのは高負荷時に限られるため。組織としてはガバナンスが優先）。SessionStart の打ち切りに関する改善案は、この前提で書き直してよい

## 利用者が決めたこと（報告書の改訂で前提にする）
- 送信先の置き場所は**案 A**: 開発ツリーの `plugin/config.json` に本番の値を置く（今の `release.md` のまま）。E2E は `e2e/_market.py` の組み立てで送信先をローカルか空に差し替える。`decisions/plugin.md` の「空のまま置く」を改める。`conftest` で止める案は採らない
- CSV が無いときの準拠率は**端末基準で出す**: 分母を「policy 行が届いた利用者」に切り替え、「未導入者は含まない（CSV があれば含める）」と注記する（P2）
- hook の `timeout`（`hooks.json`）: **SessionStart は 60 秒、収集の hook は 10 秒**。session_start.py は `source` で分岐しないので、resume・clear・compact でも適用は走る。ただし新しい版が効くのは次に起動したプロセスからなので、長く続くプロセスで新しい policy が届くのは再起動か resume まで（未検証・要確認）
- spool の上限（`config.json` の `spool_max_days`・`spool_max_bytes`）: **14 日・20 MB**。error 行の二乗の増え方の修正とセットにする
- 量が問題になったときの対策（古い生データの日次集計への圧縮など）は**将来の検討事項**。置き場は `decisions/server.md` の「条件が変われば再検討すること」。散らばった保留事項の整理も改善案に入れる
- **文書では設定値を数値で直書きせず、名前（`hooks.json` の `timeout`、`config.json` の `spool_max_days` など）で書く。**実測値は測定の事実なので数値でよい。既存の `docs/` の直書きの置き換えも改善案に入れる
- 端末側での集計・粒度の段階・gzip は採らない（今の量は小さい。YAGNI）
