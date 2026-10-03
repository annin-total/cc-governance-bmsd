# 4c 設定の自動適用（Mods で同等にできるか）実機検証の報告

- 対象: Claude Code 2.1.288、macOS、隔離 `CLAUDE_CONFIG_DIR=$S/cfg`、未ログイン。`$S` = scratchpad/g4c
- mod とスクリプトの正本: worktree `spikes/mods-feasibility/g4c/`（コミット fea5477）
  - `feas-set/`（mod。`FEAS_SCN=cs:<名前>` か `ss:<名前>` で classic.SessionStart か session.start の中から検証を 1 つ実行。書き込み先は SAFE（scratch）の下だけに制限）
  - `feas-py/`（比較用の command hook。Python で settings.json を書き換え、UserPromptSubmit・ConfigChange で env を記録）
  - `run.sh`（`-p` 用）・`tui.sh`（tmux 対話用）・`reader.py`（途中の内容が見えるかを数える読み手）
- 記録: `$S/out/<tag>/*.json`、debug: `$S/logs/<tag>.debug.log`

## 項目ごとの判定

| # | 項目 | 判定 | 根拠（事実） |
|---|---|---|---|
| 1 | 書けるか | 同等にできる | classic.SessionStart（t1・I1）と session.start（SS-write）の両方から `$.fs.write(<cfg>/settings.json)` が成功。`-p` は rc=0、対話の画面にも許可の確認は出ない。`permissions.deny` に `Edit(...)`・`Write(...)` を書いても止まらない（DENY） |
| 2 | 原子性 | できない（上書き） | inode が書き込みの前後で同じ（189185950 → 189185950）・既存のモードを保つ（600 のまま）。長さの違う内容（1 MB と 1 KB）を交互に 300 回上書きすると、約 25 万回の読み取りのうち **mixed 12 件・末尾が欠けた内容 15 件**が見えた（`logs/reader-mix-big.txt`）。同じ長さの上書きでは 4,000 回で 0 件（観測できなかっただけで、安全の証拠ではない） |
| 2' | シンボリックリンク | 同等にできる | `fs.write(settings.json → real/s.json)` はリンクを保ち、先のファイルに書く（L-write）。`stat({resolve:true}).realPath` も正しく返る |
| 3 | 原子的な置き換えの補完 | 条件付き | `fs.write(tmp)` → `$.process.run(['mv','-f',tmp,dst])` で途中の内容 0 件（同条件 60 回、約 46 万回の読み取り。`reader-mix-bigmv.txt`）。ただし dst がリンクだと mv がリンクを普通のファイルに置き換える（L-writemv）。realPath に対して行えばリンクは保てるが、モードが umask 由来の 644 になる（L-writemvreal。今の実装は mkstemp なので 0600 になる）。`process.run` は型定義で CLI 限定。デスクトップは未検証 |
| 4 | 読み取り | 条件付き（text 読みは危険） | BOM 付き: 先頭に U+FEFF が残り、`JSON.parse` が SyntaxError（parse_failed にできる）。**Latin-1・cp932: U+FFFD に置き換わって黙って読め、`JSON.parse` も成功する**（`"caf�"`）。壊れた JSON: SyntaxError。無い: `HooksError: ... failed: ENOENT`（`code` プロパティは無く、文言にだけ ENOENT）。補完: `{as:'bytes'}` ＋ `new TextDecoder('utf-8',{fatal:true,ignoreBOM:true})` で Latin-1・cp932 は TypeError、BOM は残るので判定できる（X-decode）。`Uint8Array.fromBase64`・`TextDecoder` は使える |
| 4' | `$.settings.read({source:'user'})` | 条件付き | `CLAUDE_CONFIG_DIR` に従う（隔離側の値 `user-ok` が返る）。壊れた JSON・型違い（`cleanupPeriodDays:"x"`）では `{}`（ファイルが無いときと区別できない）。BOM 付きは読める。Latin-1 は U+FFFD 込みで返る（本体自身も置換文字で読んでいる） |
| 5 | 効く時機 | 同等（mod と command hook で差なし） | 本体は settings.json を監視する（debug `Watching for changes in setting files`）。書いた約 1 秒後に `Detected change` → ConfigChange（`source:user_settings`、mod の classic と command hook の両方）→ `Settings changed from userSettings, updating app state`。以後、同じセッションで `$.env.get`・`settings.read`・command hook の環境変数が新しい値になる（対話 I1: mod、I2: Python。どちらも同じ）。`-p` ではセッションが先に終わるか、UserPromptSubmit が反映の前に来て古い値（t1） |
| 5' | セッション中に壊れた場合 | 参考 | 対話中に settings.json を壊れた JSON に置き換えると、`settings.read` は `{}` になるが、プロセスの env は前の値のまま。マーケットプレイス経由で有効にしたプラグインの command hook も、そのセッションでは動き続けた（I3） |
| 6 | 書式 | 条件付き | 日本語・`/`・制御文字・U+2028/2029・絵文字・空の `{}` と `[]`・入れ子の配列はバイト単位で一致。**違うのは数値**: `60.0`→`60`、`100.0`→`100`、`1e+16`→`10000000000000000`、`1e-07`→`1e-7`、`-0.0`→`0`、`12345678901234567890`→`12345678901234567000`（精度落ち）。比較は `cfg/fmt/out-py.json` と `out-js.json` |
| 7 | バックアップ | 条件付き | 新しいファイルは `0666 & ~umask`（umask 022 で 644、077 で 600）、新しいディレクトリは `0777 & ~umask`。権限は指定できない。`exists` → `write` は排他にならない（2 回目が黙って上書き）。`list`・`stat` で名前と `mtimeMs` が取れ、世代の判定はできる。削除の手段は `fs` に無く、`process.run(['rm','-f',p])` で消せた。補完: `process.run(['sh','-c','umask 077; set -C; cat > "$1"','sh',p],{stdin})` で O_EXCL・0600（2 回目は exitCode 1・`cannot overwrite existing file`。X-excl） |
| 8 | mtime の精度 | 条件付き（実用上は足りる見込み） | `mtimeMs` は小数付きの double。`…123456789ns` → `1791000000123.4568`、`…123456001ns` → `1791000000123.456`（788ns の差は区別できた）。今の絶対値での double の分解能は約 0.24µs で、それ未満の差は失われる（計算）。今の実装は `st_mtime_ns` の厳密比較 |
| 9 | 組み込み mod の拒否 | 隔離環境では拒否なし・会社の環境は未検証 | 読み込まれた組み込みは agents-md・telemetry・diff で、拒否しなかった。`cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization`。本体のバイナリの文字列に「Team と Enterprise では最も外側に着座し、organization の classic hooks・prompt・settings・tool policy を利用者が入れたプラグインから守る」旨と `allowManagedModsOnly`・`allowModsToOverrideDenyRules` がある。利用者の settings.json への `fs.write` を拒否するかは未検証 |

## 補完手段の候補

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| A | 全部 mod、`fs.write` で直接上書き | 依存なし・全プラットフォーム（`process.run` 不要） | 原子的でない。書いている途中に別セッションが起動すると壊れた内容を読みうる。書き込み中にプロセスが落ちると欠けたファイルが残り、以後のセッションで settings.json が丸ごと無視されてプラグインが止まる（推測。中断は試していない） |
| B | `fs.write(同じディレクトリの tmp)` → `process.run(mv)`、dst は realPath | Python 不要。macOS で途中の内容 0 件 | CLI 限定。モードが umask 由来（今は 0600 になる）。Windows は別コマンドが要る。mv 失敗時の tmp の後始末に `rm` が要る。O_EXCL のバックアップは別途 `sh -c 'set -C'` |
| C | 読み取り・判定・JSON 生成は mod、**書き込み・置き換え・バックアップだけ同梱の Python に残す**（`process.run(['python3', script, path], {stdin})`） | 今の意味論（mkstemp 0600・`os.replace`・O_EXCL・`st_mtime_ns`）をそのまま保てる。リンク維持・UTF-8 も確認済み（X-pyrep） | Python 依存が残る（今と同じ）。起動に約 0.4 秒（この Mac）。CLI 限定 |
| D | F 全体を今の command hook のまま残す（混成） | 変更なし・危険なし | 2 つの実行環境を保守する |

共通の補完: 読み取りは `{as:'bytes'}` ＋ `TextDecoder` の fatal と BOM の判定で今の `parse_failed` を再現できる。`settings.read` は壊れたファイルを `{}` で返すので判定に使わない。書式は数値を含む値だけ差が出るので、浮動小数を含む settings で書き直すと値の表記が変わる（`60.0`→`60`）。

Windows の候補（すべて推測・実機なし）: `cmd /c move /y`（内部の API と原子性は未確認）、PowerShell の `[System.IO.File]::Replace(src, dst, $null)`（ReplaceFile API）、`python -c "import os; os.replace(...)"`（MoveFileExW＋REPLACE_EXISTING）。本体が settings.json を開いたままだと共有違反で失敗しうる（推測）。

## 事実と推測の区別

- 事実: 上の表の「根拠」列（stat・debug・記録ファイル）
- 推測: 案 A の「中断で欠けたファイルが残る」、Windows の候補すべて、mtime の分解能が実用上足りること、sec-default の挙動、未ログインのモデル呼び出しが送信前に失敗していること（debug は `Could not resolve authentication method`）

## 未検証事項

- Windows・デスクトップ（`process.run` が使えない面）・Bedrock・会社の環境（sec-default の着座、`allowManagedModsOnly`）
- 書き込みの途中でのプロセス中断
- autoUpdate が次のセッションで known_marketplaces に現れる時機（今回は env だけを見た）
- 同じ長さの上書きで途中の内容が見えるか（4,000 回で 0 件）

## 痕跡

- 本人の `~/.claude/settings.json` の md5: 実施前後とも `ec57c5ebb2a5ad9cd886efc196dc5867`
- `~/.claude.json`: md5 は変わった（`acdf94…` → `d07585…`）が、`g4c`・`feas-set`・`feas-py`・`g4c-mkt` の文字列は 0 件。親セッションも書き換えるため、この変化の出どころは特定できない。**`claude plugin validate . --strict` を 1 回だけ隔離せずに実行した**（規則からの逸脱。settings.json は不変）
- Keychain: 隔離側のエントリ（`Claude Code-credentials-9e1451f0`）は無い
- tmux `-L gov4c` は kill-server 済み・ソケット削除済み。`pgrep` で子 claude・tmux の残りなし
- 未ログインのまま `-p hello`（t1）と対話の `hi`・`hi2`・`hi-a/b/c` を送り、モデル呼び出しが認証エラーで失敗した
- 隔離側に残るもの: `$S/cfg`（settings.json・マーケットプレイス `g4c-mkt` の登録・feas-py の導入）、`$S/mkt`（feas-py のコピー）、`$S/out`・`$S/logs`。worktree の `feas-set/` に本体が書いた `tsconfig.json`・`.claude-plugin/types/`（`.gitignore` 済み）
