# UC 14: 同時起動の書き込みの競合

## 目的

同じ `CLAUDE_CONFIG_DIR` で多数のセッションを同時に起動したとき、SessionStart の hook による settings.json の書き込みが
壊れない・利用者の値を消さない・配布値が入る・バックアップを正しく残す・残骸を残さない・policy 行を重複させないかを、実物で確かめる。

## 確かめる仮説（どう壊れうるか）

`plugin/hooks/_settings.py` と `_govdir.py` を読んで立てた。

1. **書きかけが見える**: `_write` は mkstemp → `os.replace` なので、読み手が書きかけを見ることは無いはず（壊れるなら置換が原子的でない）
2. **検査から置換までの窓（TOCTOU）**: `_settings.py:72` の mtime 検査と `:80` の `os.replace` の間（`_govdir.backup` を含む）に
   他者が書くと、その書き込みは黙って上書きされる。配布値だけを書く hook 同士なら内容が同じで無害。利用者・本体の書き込みなら消える
3. **バックアップの押し出し**: 同時に複数が `backup` → 刈り込み（`_govdir.py:62`）を行い、正しい（書き換え前の）世代が消える
4. **ONCE の記録の読み書き**: `save_once`（`_govdir.py:84`）は `write_text` で原子的でない。書いている途中を別セッションが読むと空扱いになり、ONCE を再適用しうる
5. **statusline.js の複製**: `sync_statusline` の一時ファイル名が固定（`_govdir.py:107`）。同時に複製すると中途半端な内容が残りうる
6. **打ち切りと競合の混同**: 高負荷で SessionStart が timeout 5 秒で `cancelled` になると、適用も policy 行も抜ける（UC 06・12）。これを競合と取り違えない

## 手順

一時スクリプト（このフォルダ）。実行は `CC_E2E_RUN=a .venv/bin/python run.py <claude|hook> <出力 JSON> N [N ...]`（このフォルダを cwd にする）。

- `uc14_lib.py`: 隔離ルートの準備（導入 → 暖機の 1 セッションで data ディレクトリを作らせる → 利用者の値を足した基準の settings.json を作る → 偽の古いバックアップ `settings-20000101-…-00〜09.json` を 10 世代置く）、段ごとのリセット、同時起動、監視
- `judge.py`: 段の後の判定（settings.json の妥当性・利用者の値・配布値・バックアップ・残骸・policy 行・hook の結果）
- `run.py`: 段を順に流す。各段の後に `claude doctor` で "Invalid settings" が出ないかも見る
- `run_heavy.sh`: `heavy.lock` を最長 90 分待って取り、本番を流し、`trap` で必ず `rmdir` する
- `mk_mutants.py`: 判定のゲート確認用に、壊した `_settings.py`（非原子的な書き込み）と窓を広げた `_settings.py`（読んでから 0.3 秒待つ）を `.local/` に書き出す
- `gate_judge.py`: 判定関数に壊した settings.json を直接与えて落ちるかを見る
- `probe_window.py`: 仮説 2 の窓を、`_govdir.backup` の差し替えで決定的に起こす

配る policy（`uc06_lib.policy_src`）: SET `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE="60"`・`autoUpdate=True`、ADD `permissions.deny=[Read(./uc14-secret)]`、ONCE `env.UC14_ONCE="first"`（4 キー）。
利用者の値: `theme`・`env.USER_KEEP`・`permissions.allow`・`permissions.deny=[Bash(rm -rf /)]`・`uc14_user`（入れ子と配列）。

## 負荷の掛け方

- 段ごとに settings.json を基準（配布値が無い状態）へ戻し、`once.json` と `statusline.js` を消す。バックアップと利用ログは段をまたいで残す（押し出しを見るため）
- N 本をスレッドのバリアで揃えて同時に起動する
  - `claude` モード: 未ログインの `claude -p ok --output-format stream-json --verbose --include-hook-events`（API 費用 0。UC 06 で未ログインでも SessionStart が動くと確認済み）。SessionStart の `hook_response` の `outcome`・`exit_code`・`stderr` を数える
  - `hook` モード: claude を介さず `session_start.py` を直接起動（claude の起動時間のばらつきが無いぶん窓がそろう）
- 段の間、別スレッドが 2 ms ごとに settings.json を読み、JSON として読めなかった回数・消えていた回数を数える
- 段ごとに load average（前後）と `memory_pressure` の空き率を記録する。claude は 1 本約 200 MB（予行で実測）なので、空きが 15% 未満なら claude の段を飛ばす

## 結果

大きいログと JSON は `.local/e2e-load-testing/uc-14-concurrent-write/` にある。

### 準備段階（lock なし。claude は同時 1 本まで）

条件: macOS・`claude` 2.1.283・未ログイン・Docker 不使用・load average 10〜17（ほかのトラックと並行）。

| 実行 | 段（N） | settings.json | 監視の読み取り失敗 | policy 行（実数/期待） | 結果の内訳 | バックアップ |
| --- | --- | --- | --- | --- | --- | --- |
| hook 直接（`hook-10-30.json`） | 10・30・10・30 | 全段で有効・利用者の値と配布値あり | 0（各段 約 1000 回読み） | 40/40・120/120・40/40・120/120 | 3 段は `applied` 4 行（1 本だけが書いた）。**3 段目は `applied` 8 行＝2 本が両方書いた** | 偽 10 → 本物が 1 段で 1〜2 世代ずつ押し出し。本物はすべて基準と同じ内容 |
| 窓を広げた実装（`amp-widen.json`。読んでから 0.3 秒待つ） | 10・30 | 有効・値あり | 0 | 40/40・120/120 | N=10 で `skipped_conflict` 21 行（mtime の検査が競合を拾った）。N=30 は起動がばらけて 0 | 本物 1 世代ずつ |
| 非原子的な書き込み（`gate-nonatomic.json`。ゲート確認） | 10・30 | 最終状態は有効 | **16・10 回の読み取り失敗**（書きかけの JSON が見えた） | 120 行中 `parse_failed` 4 行 | — | — |

- 一時ファイルの残骸（`.settings-*.tmp`・`.statusline.js.tmp`）: 全段 0。`statusline.js` は全段で同梱物と同じ内容
- `once.json`: 全段で 1 キーだけの正しい内容。重複した `event_id`: 0。error 行: 0。hook の exit・stderr: 全部 0・空
- 判定のゲート: 監視スレッドは非原子的な実装で落ちる（上表）。`gate_judge.py` で、壊れた JSON・利用者の値の消失・利用者の deny の消失・配布値の重複・配布値の欠落・`enabledPlugins` の消失の 6 通りがすべて NG になることを確かめた。`claude doctor` は壊れた settings.json に対して `Invalid settings` と該当ファイルを出し（非対話で終了コード 0）、正常なら出さないことを確かめた
- 予行: claude モード N=1 で SessionStart は `success`、4 行 `applied`、バックアップは基準 1 世代

### 仮説 2 の窓（`probe_window.py`。決定的に起こした）

`_govdir.backup` を差し替えて、mtime の検査の直後に他者が settings.json を書き換える状況を作った。
結果: hook は `applied` を返し、**他者の書き込み（`user_edit`）は黙って消えた**。消えた内容はその回のバックアップには入る（バックアップは検査の後に読むため）。
`tests/plugin/client/test_settings.py:361` の `_interrupt_after_read` は mkstemp の前（検査の前）に割り込むだけで、検査から置換までの窓は見ていない。

### 本番（heavy.lock を取得。20:56〜21:03 に 3 回に分けて取得・返却）

条件: 同上・未ログイン（API 費用 0）。load は段の直前の 1 分平均。空きメモリは `memory_pressure` の空き率。
claude の段は 1 つの隔離ルートで続けて流した（段ごとに基準へ戻す。バックアップは累積）。

| ファイル | N | 起動 | load 前→後 | 空き | セッション時間 | SessionStart の outcome | policy 行（実数/success×4） | settings.json | バックアップ（偽/本物） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| main-claude | 10 | 一斉 | 8.7→15.2 | 32% | 5.6〜6.1 秒 | success 10 | 40/40（applied 4・already_ok 36） | 有効・全値あり | 9/1 |
| main-claude | 20 | 一斉 | 14.3→26.1 | 37% | 15.9〜19.4 秒 | **cancelled 20** | 0/0 | 有効・基準のまま（配布値なし） | 9/1 |
| main-claude | 30 | 一斉 | 26.4→59.3 | 38% | 65.8〜68.5 秒 | **cancelled 30** | 0/0 | 有効・基準のまま | 9/1 |
| extra-burst15 | 15・15 | 一斉 | 44.0・42.3 | 30%・39% | 11.1〜13.5 秒 | success 15・15 | 60/60・60/60 | 有効・全値あり | 9/1→8/2 |
| extra-burst20 | 20・20・18 | 一斉 | 31.1・36.5・43.2 | 40〜46% | 13.3〜15.8 秒 | cancelled 19＋success 1・cancelled 20・cancelled 5＋success 13 | **8/4**・0/0・**56/52** | 有効。全 cancel の段だけ配布値なし | 9/1→8/2 |
| extra-stagger（0.5 秒間隔） | 20・30 | 順に | 36.7・35.1 | 43〜44% | 2.8〜10.5 秒 | success 20・30 | 80/80・120/120 | 有効・全値あり | 9/1→8/2 |
| main-hook（直接起動） | 60・100 | 一斉 | 44.4・43.7→74.1 | — | — | direct 60・100（exit 0・stderr 空） | 240/240・400/400 | 有効・全値あり | 9/1→8/2 |

全段に共通:
- **settings.json は一度も壊れなかった**: 監視スレッドの読み取り失敗・消失 0（各段 約 1000〜8000 回読み）。`claude doctor` の `Invalid settings` 0。利用者の値は全段で残った
- **競合（`skipped_conflict`・`write_failed`・`parse_failed`）は 0**。各段で `applied` を名乗ったのは 1 本（4 行）だけで、ほかは `already_ok`。重複した `event_id` 0、ADD の要素の重複 0、error 行 0
- 一時ファイルの残骸 0（打ち切られた hook が 50 本以上あっても `.settings-*.tmp`・`.statusline.js.tmp` は残らなかった）
- hook の exit code は success で 0、cancelled で 1。stderr は全部空。子プロセスの取り残し 0（`pgrep -f cc-e2e-a-14` で確認）

### 打ち切り（cancelled）と競合の区別

- 一斉に 20 本以上を起動すると、SessionStart の hook がほぼ全部 `cancelled` になった（4 回中 3 回は 19〜20 本、18 本では 5 本）。15 本は load 44 でも 2 回とも全部 success。**閾値は load average より、同時に起動する本数（CPU の取り合いの瞬間値）に依存する**ように見える（推定。8 コア）
- 同じ 20・30 本でも **0.5 秒ずつずらすと全部 success**（セッション 2.8〜10.5 秒）。複数のターミナルを人が順に開く現実の使い方では、打ち切りは起きにくい（推定）
- 全部 cancelled の段では `statusline.js` も作られず `once.json` も無い。hook は最初の段（`_identity.get_user_email(refresh=True)`・`sync_statusline`）より先へ進む前に止められた（推定。hook が止められた位置は直接は見ていない）
- **`cancelled` でも書き込みと policy 行が届くことがある**: `extra-burst20` の 1 段目は success 1 本なのに policy 行 8 行（2 本分）、3 段目は success 13 本で 56 行（14 本分）。本体は待つのをやめただけで、hook の処理は最後まで走った場合がある。`cancelled` の数から「適用されなかった端末の数」を数えることはできない
- 打ち切りが競合を生む兆候（書きかけ・残骸・値の欠落）は無かった。打ち切りの被害は「その回の適用が抜ける」だけで、次のセッションで取り返す（UC 06 と同じ）

## 想定外だったこと

- 一斉起動の 20 本で、ほぼ全部の hook が打ち切られた（一部ではなく全部）。書き込みの競合を見るつもりが、実物の claude では競合より先に打ち切りが支配的になる
- 直接起動 100 本でも `skipped_conflict` は 0。python の起動がばらけ、最初の 1 本が書いた後に残りが読むため。競合は、読んでから書くまでの窓を広げた実装（0.3 秒）で初めて出た（21 行）
- 直接起動の N=10 で、2 本が同じ基準を読んで両方とも書いた（`applied` 8 行・バックアップ 2 世代とも基準）。mtime の検査は排他ではないので、同時に検査を通れば両方書く。内容が同じなので無害

## 課題と改善案

### バグと思われるもの（`plugin/`）

1. `plugin/hooks/_settings.py:72-80`: mtime の検査と `os.replace` の間に `_govdir.backup` があり、その窓に入った他者の書き込み（利用者の手編集・本体の `/config`・別セッションの別内容）は黙って消える（`probe_window.py` で決定的に再現。消えた内容はその回のバックアップには残る）。hook 同士なら内容が同じで無害なので実害は小さい見込み。直すなら、バックアップを検査より前に取り、検査を `os.replace` の直前に置いて窓を最小にする（完全には消えない。完全を求めるならロックファイル）。優先度: 低
2. `plugin/hooks/_govdir.py:84` `save_once`: `write_text` で原子的でない。書いている途中に別セッションが `load_once` すると空扱いになり、ONCE を再適用して利用者が変えた値を戻しうる。今回の実測では観測されなかった（`once.json` は全段で正しい）。直すなら `_settings._write` と同じ mkstemp → `os.replace`。優先度: 中（ONCE を使い始めたら）
3. `plugin/hooks/_govdir.py:107` `sync_statusline`: 一時ファイル名が固定（`.statusline.js.tmp`）。同時に複製すると他者の一時ファイルを置換しうる。今回は全段で最終内容が正しく、残骸も無かった。直すなら mkstemp。優先度: 低
4. mtime の比較は ns 精度の APFS では有効だが、粒度の粗いファイルシステム（ネットワークドライブなど）では同じ刻みの置換を見逃す（推定・未検証）。比較に `st_ino` と `st_size` を足すと強くなる

### `tests/`（E2E より安く確実）

5. `tests/plugin/client/test_settings.py` に「検査の後・置換の前に割り込まれた書き込み」のテストを足す（今は `_interrupt_after_read` が mkstemp の前だけ）。改善 1 を入れるならその回帰テストになる
6. `save_once` の原子性（書いている途中を読んでも空にならない）の単体テスト

### `e2e/` の追加・修正

7. 同時起動のテストは E2E に昇格させない。実物の claude では 20 本で打ち切りが支配的になり、競合はほぼ起きない。書き込みの安全性は `tests/` と、このフォルダの `run.py hook`（直接起動・API 費用 0・数十秒）で見るほうが確実
8. UC 06 の改善案 3b（`session()` が `cancelled` を見て「打ち切り」として区別する）を後押しする。加えて、`cancelled` でも行が届くことがあるので、判定は `cancelled` の数でなく行と settings.json の中身で行う

### `docs/guide/e2e.md` の修正

9. 「マシンが重いと、SessionStart の hook が 5 秒で打ち切られ、1 回目のセッションの判定が偽の赤になる」ことと、並列で E2E を流すときの目安（この Mac では claude の一斉起動 15 本までは全部 success、20 本でほぼ全部 cancelled）を書く

### `docs/knowledge/` に足す外界の事実（claude 2.1.283・macOS・8 コアで実測）

10. SessionStart の hook の `outcome: cancelled`（exit_code 1）は、hook のプロセスが最後まで走った場合でも出る（本体が待つのをやめるだけのことがある）。cancelled の hook も副作用（ファイルの書き込み）を残しうる
11. 同じ `CLAUDE_CONFIG_DIR` で `claude -p` を一斉に 20 本以上起動すると、timeout 5 秒の SessionStart の hook がほぼ全部打ち切られた。0.5 秒ずつずらせば 30 本でも打ち切りは 0
12. `claude doctor` は非対話で動き（終了コード 0）、パースできない settings.json を `Invalid settings` と該当パスで報告する。設定の妥当性を確かめる手段として使える
13. `claude -p`（未ログイン）1 本の RSS は約 200 MB

### e2e スキルの拡張

14. 負荷・競合の枝に「判定を直接起動の hook で先に固め、実物の claude は打ち切りの閾値の測定に使う」手順と、`heavy.lock` を `trap` で必ず返すスクリプトの雛形（`run_heavy.sh`）を置く

## 未実施・未検証

- 本物のバックアップが 10 世代を超えて押し出される状況は起きなかった（1 段で書くのは 1〜2 本）。押し出しで見たのは「偽の古い世代から順に消える」ことと「常に 10 世代に保たれる」ことまで
- 認証ありの `claude -p` での同時起動はしていない（設定の適用に認証は要らないため、未ログインで代えた）
- 対話起動での同時起動（本体が settings.json を書く操作と hook の競合）はしていない
- 打ち切られた hook がどこで止められたかは直接見ていない（statusline.js の有無からの推定）

## 片付けたもの・残したもの

- 片付けた: 隔離ルート（`$TMPDIR/cc-e2e-a-14-*`）はすべて削除。子プロセスの取り残し 0（`pgrep -f cc-e2e-a-14`）。`heavy.lock` は 3 回とも `rmdir` 済み（`trap`）
- 残した: 実行ログと JSON・壊した実装（`mutant_nonatomic.py`・`amp_widen.py`）を `.local/e2e-load-testing/uc-14-concurrent-write/` に。一時スクリプトはこのフォルダに
- コードの変更: なし（`plugin/`・`e2e/` は変えていない）
