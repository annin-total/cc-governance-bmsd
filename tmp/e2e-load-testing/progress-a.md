# トラック a の進捗

| UC | 状態 | 結果の 1 行 |
| --- | --- | --- |
| 01 | 済 | 更新の経路は正常（prev_value・ONCE の差し替え・新 installPath）。型違いの値（例 `cleanupPeriodDays: "30"`）は本体が settings.json ごと黙って読み捨て（UC 13 と同じ機構）、プラグインが `enabled: false` 表示・hook 全停止、直した版も届かない。気づけるのは `claude doctor` だけ。キーの型を戻せば再開 |
| 06 | 済 | REMOVE・SET の None は仕様どおり（利用者の要素は残る）。既存 E2E は撤回を全く判定していない（壊した実装で PASS・正しい実装で偽の赤）。ADD と REMOVE の重なりで毎回書き込み・バックアップ押し出しの不具合候補、ロールバックで ONCE の利用者値を上書き |
| 13 | 済 | 本体が捨てる settings.json（壊れた JSON・トップが配列・`env` が文字列・2 MiB 超など）では enabledPlugins も効かず hook が無言で全停止、行が届かず未使用と区別不能。`_settings.py` にバックアップの先取り（置換失敗で毎回増える）・0444 を 0600 で上書きのバグ候補 |
| 12 | 済 | 例外 4 種で適用だけが止まり、お知らせ・収集・送信は継続、error 行はサーバの表まで到達（enabled は true のまま、直した版で追いつく）。JSON に書けない値で `.settings-*.tmp` が残るバグ（`_settings.py:68-82`）、`SystemExit` は全段を無言で止める |
| 14 | 済 | 一斉 10〜30 本・順次 20/30 本・hook 直接 10〜100 本で settings.json は一度も壊れず（doctor Invalid 0・利用者値の消失 0・残骸 0）。ただし実物の一斉起動 20 本以上で SessionStart の hook がほぼ全部 timeout で cancelled、適用が抜ける。`_settings.py:72-80` の検査〜置換の窓で他者の書き込みを黙って上書き |
| 60 | 済 | uninstall が消すのは `enabledPlugins` の項目と data（既読・未送信の queue/spool を黙って失う。`--keep-data` で残る）。`statusLine`・配った値・`governance/` は残りステータスラインは動き続ける。再導入でお知らせ再表示、`governance/` を消してからだと ONCE が利用者値を上書き |
| 41 | 済 | 無効化中は event 行を一切積まないので再開後に漏れない。policy 適用・statusline 同期は継続。`"0"` も無効化扱い（空でなければ無効。文書どおりだが利用者向けには罠）。settings.json の env に直書きしても hook に届き、policy に書き消されない。バグなし |
| 24 | 済 | `-p`・SDK 相当は `sdk-cli`（`sdk-*` はそのまま）で既読・ブラウザとも起きない。ただし `-p` が書き換えるのは `cli` と空文字だけで、親から `claude-vscode`・未知の値を継いだ `-p` は人が見ずに既読にする（`session_start.py:75`・`_browser.py:18-20`）。ブラウザは偽 `open` で 0 回 |
