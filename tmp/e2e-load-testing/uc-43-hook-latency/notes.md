# UC 43 hook の処理時間と起動の遅延（ユースケース集 43・85）

Claude Code 2.1.283。日付 2026-09-27。トラック C（`CC_E2E_RUN=c`。Docker は使っていない）。

**この Mac の数字は本番の性能を表さない。**導入あり・なしの相対比較としてだけ読む。
他トラックが同じ Mac で並行しており、load average は 7〜47 の間を動いた（各表に添える）。

## 測定環境

| 項目 | 値 |
| --- | --- |
| マシン | Apple M2・8 コア・8 GiB・macOS 26.6.2 |
| Claude Code | 2.1.283 |
| hook を動かす `python3` | pyenv 2.6.13 のシム（`~/.pyenv/shims/python3`、bash スクリプト）→ 実体は `~/.pyenv/versions/3.13.2/bin/python3`（Python 3.13.2、**x86_64**・Rosetta 経由） |
| pyenv 本体 | `/usr/local/Cellar/pyenv/2.6.13`（Intel 版 Homebrew の場所）。exec フックに `pip-rehash.bash` |
| 参考 | `/usr/bin/python3` は 3.9.6 |

## 目的

1. 導入あり・なしで、起動（未ログインの `-p ok`）と、認証ありの往復（haiku `Reply ok`）の壁時計時間がどれだけ違うか
2. hook 単体（実採取の stdin を流す）の処理時間と、5 秒のタイムアウトとの距離
3. SessionStart の内訳（初回と 2 回目、送信先が閉じている・遅いときに起動が延びないか）
4. ツール 1 回あたりの増分

## 確かめる仮説（どう壊れうるか）

- hook の処理が重く、ツールごとに体感できる遅延を足している
- SessionStart の初回（設定の適用・お知らせ）が起動を目立って遅らせる
- 送信プロセスの切り離しが効いておらず、送信先が応答しないと起動が送信のタイムアウトまで待たされる
- 負荷の高い端末で hook が 5 秒のタイムアウトに届く
- 計測スクリプトが実は hook を動かしていない（ゲート確認で否定する）

## 手順

一時スクリプト（このフォルダ）。すべて `e2e/` の部品（E2ERoot・GitHttpServer・install・install_path・hook_rows）を import して使う。
**開発ツリーの `plugin/` は書き換えていない。**sleep 入りの版は publish の overrides（計測 1）と installPath のコピー（計測 2）にだけ入れた。

- `_uc43.py`: 計時（前後の load average と heavy.lock の有無を記録）・要約（中央値・p90）・sleep の差し込み・導入済みルート
- `bench_hooks.py [回数]`: 計測 2。installPath の `collect.py <Hook>` と `session_start.py` に `tests/fixtures/hook_inputs/` の stdin（読むだけ）を流す。全ケースを 1 周ずつ交互に回す
- `bench_start.py [回数]`: 計測 1（未ログイン）と計測 3。claude は常に 1 つずつ直列
- `bench_auth.py <reply|bash> <回数>`: 計測 1（認証あり）と計測 4。費用の上限で止まる
- `stage_profile.py [回数]`: 計測 3 の内訳。session_start の段の関数を本物の python3 のプロセス内で直接呼んで計時

比較の組（すべて同じ回の中で交互に実行し、奇数回は順序を逆にした）:

- **plugin**: プラグイン導入済みの隔離ルート（PATH はこの Mac のまま＝ `python3` は pyenv のシム）
- **none**: 同じ仕組みの隔離ルートでプラグイン未導入
- **plugin_realpy**: plugin と同じルートで、PATH の先頭に「`python3` → pyenv の実体」へのシンボリックリンクだけを置いたディレクトリを足したもの（シムを飛ばす）

隔離は `CLAUDE_CONFIG_DIR` のみ（E2ERoot）。hook 単体の計測は `CLAUDE_CONFIG_DIR`・`CLAUDE_PLUGIN_DATA` をルート内の別ディレクトリに向け、`CLAUDE_CODE_ENTRYPOINT=sdk-cli`（非対話扱い＝ブラウザを開かない）で動かした。`notices.json` のお知らせに URL は無いので、どの条件でもブラウザは開かない。

## 負荷の掛け方

- 自分の中では常に claude 1 つ・hook 1 つの直列。負荷は他トラックが作ったもの（制御していない）
- 認証ありの `-p` は haiku で計 69 回（`Reply ok` 60 回 + Bash 5 回のセッション 9 回）+ 試行 6 回

## 結果

### ゲート確認（計測が本当に hook を動かしているか）

| 対象 | 通常 | sleep 0.5 入り | 差 |
| --- | --- | --- | --- |
| hook 単体 PostToolUse（n=20、load 7〜9） | 0.465 s | 0.996 s | +0.53 s |
| hook 単体 SessionStart（n=20、load 7〜9） | 0.520 s | 0.998 s | +0.48 s |
| 起動 `-p ok`（SessionStart に sleep、n=5） | 1.961 s | 2.551 s | +0.59 s |

いずれも約 0.5 秒増えた。加えて、各起動で queue に行が増えること（plugin は毎回 4 行: SessionStart・UserPromptSubmit の event と policy 2 行、none は 0 行）を確かめた。hook 単体の全 640 回で終了コード 0・標準エラー 0 バイト。

### 計測 2: hook 単体（n=20、中央値 / p90、秒。python3 の起動込み）

| ケース | load 7〜9（heavy.lock あり） | load 23〜47（heavy.lock あり・なし混在） |
| --- | --- | --- |
| `python3 -c pass`（シム） | 0.430 / 0.642 | 0.428 / 1.541 |
| `python3 -S -c pass`（シム） | 0.422 / 0.462 | 0.436 / 1.856 |
| 実体 `-c pass` | 0.035 / 0.042 | 0.037 / 0.211 |
| 実体 `-S -c pass` | 0.032 / 0.039 | 0.033 / 0.088 |
| UserPromptSubmit | 0.471 / 0.579 | 0.490 / 2.040 |
| UserPromptExpansion | 0.468 / 0.494 | 0.499 / 2.316（最大 **5.95**） |
| PostToolUse | 0.465 / 0.585 | 0.482 / 2.842 |
| PostToolUseFailure | 0.471 / 0.513 | 0.464 / 1.216 |
| PreCompact | 0.497 / 0.562 | 0.490 / 1.134 |
| Stop | 0.501 / 0.785 | 0.494 / 0.843 |
| Stop（20 MB の transcript） | 0.482 / 0.544 | 0.508 / 0.956 |
| SessionStart（session_start.py） | 0.520 / 0.591 | 0.565 / 1.196 |
| PostToolUse（実体の python3） | **0.066** / 0.082 | 0.068 / 0.134 |
| SessionStart（実体の python3） | **0.094** / 0.135 | 0.105 / 0.144 |

- hook の処理そのもの（実体の python3 で起動込み）は 60〜100 ms。python3 の空起動 35 ms を引くと 30〜60 ms
- **所要時間の 9 割は pyenv のシム（約 0.39 s/回）。**`-S` にしても変わらない（site の読み込みではない）
- 5 秒のタイムアウトとの距離: 平常時は p90 でも 0.8 s 以下で十分遠い。ただし load 36〜47 の区間では最大 5.95 s（UserPromptExpansion）・4.24 s・3.88 s が出た。**高負荷の端末＋pyenv のシムでは 5 秒に届きうる。**実体の python3 は同じ区間でも最大 0.5 s
- transcript が 20 MB でも Stop は変わらない（末尾 256 KiB だけ読むため）

### 計測 1: 起動と往復（壁時計、中央値 / p90、秒）

未ログイン `-p ok`（n=20、load 7.9〜14.0、heavy.lock なし）:

| 組 | 中央値 / p90 | none との差 |
| --- | --- | --- |
| none | 0.803 / 1.025 | — |
| plugin | 1.961 / 2.348 | **+1.16** |
| plugin_realpy | 1.006 / 1.350 | +0.20 |

未ログインでは SessionStart と UserPromptSubmit の 2 つの hook が動く（Stop は動かない）。

認証あり haiku `-p "Reply ok"`（n=20、load 9.4〜14.4、heavy.lock は 60 回中 31 回あり）:

| 組 | 壁時計 | `duration_ms` の中央値 | 壁時計 − duration | `duration_api_ms` |
| --- | --- | --- | --- | --- |
| none | 3.388 / 4.337 | 1.35 | 2.06 | 1.22 |
| plugin | 6.610 / 8.027 | 3.62 | 2.97 | 1.41 |
| plugin_realpy | 3.973 / 5.221 | 1.59 | 2.32 | 1.15 |

- plugin は none より **+3.2 s**（3 つの hook）。plugin_realpy は +0.6 s
- 3 つの hook で +3.2 s は、hook 単体のシム込み 0.5 s × 3 より大きい。セッション中は 1 回あたり約 1 s に見える。**原因は切り分けていない**（推測: claude 本体と CPU を奪い合う中でのシムの bash の起動。シムを飛ばすと差は消えるので、シム由来であることまでは言える）

### 計測 3: SessionStart の内訳

起動（未ログイン `-p ok`、n=10、load 7.9〜14.0）:

| 条件 | 中央値 / p90 |
| --- | --- |
| 初回（settings.json を導入直後に戻し、`governance/` と data を消してから） | 1.803 / 2.655 |
| 2 回目以降 | 2.065 / 2.255 |
| 送信先が閉じたポート（毎回 `sent_at` を消して送信させる） | 2.076 / 2.408 |
| 送信先が 10 秒待ってから応答するサーバ（同上） | 2.072 / 2.435 |

- 初回と 2 回目に差は見えない（ノイズの範囲）
- 送信先が閉じている・遅いときも起動は延びない。遅いサーバは 10 回の起動の間に 27 回 POST を受けており、送信プロセスは起動しつつ claude の終了を待たせていない

段ごと（本物の python3・プロセス内、n=20、中央値）:

| 段 | 初回 | 2 回目 |
| --- | --- | --- |
| import（session_start と依存） | 28 ms | 29 ms |
| identity（`git config --global user.email` の子プロセス） | 12 ms | 14 ms |
| statusline | 0 ms | 0 ms |
| apply_settings | 2 ms | 1 ms |
| notices | 0 ms | 0 ms |
| collect + send_if_due | **35 ms** | 0 ms |

- 初回だけの 35 ms は送信プロセスの `Popen`（fork + exec の完了待ち）。ネットワークは待たない
- SessionStart の処理そのものは約 80 ms。利用者の言う「起動が遅い」の主因は hook の処理ではなく、python3 の起動の仕方（この Mac では pyenv のシム）

### 計測 4: ツール 1 回あたりの増分（Bash 5 回のセッション、n=3、load 8.8〜11.4、heavy.lock あり）

| 組 | 壁時計 | `duration_ms` の中央値 | turns |
| --- | --- | --- | --- |
| none | 14.53 | 12.33 | 6 |
| plugin | 19.39 | 16.30 | 6 |
| plugin_realpy | 15.06 | 12.47 | 6 |

- plugin は none より +4.9 s（hook 8 回: SessionStart・UserPromptSubmit・PostToolUse×5・Stop）。PostToolUse は 3 回とも 5 行ずつ記録された
- ツール 1 回あたり: (Bash の差 4.0 s − Reply の差 2.3 s) / 5 ≈ **0.35 s**（シムあり）。シムなしでは差がノイズに埋もれる（±0.1 s 未満）
- n=3 で費用の上限により打ち切り。1 回目の試行（n=1）では plugin 21.6 s / none 13.1 s / realpy 12.6 s

### 費用

認証ありの合計 **約 0.41 USD**（試行 0.087 + Reply 0.161 + Bash 0.164。`total_cost_usd` の合計）。

## 想定外だったこと

- **遅延のほぼ全部が pyenv のシムだった。**hook の処理は 30〜60 ms だが、`python3` がシム経由だと 1 回あたり +0.39 s（単体）〜約 1 s（セッション中）。この Mac の pyenv は Intel 版 Homebrew の場所にあり、python 3.13.2 も x86_64 だが、実体の起動は 35 ms で Rosetta は主因ではない。シム（bash の `pyenv exec`）の処理が重い
- 認証ありのセッション中は、hook 1 回あたりの増分が単体計測の約 2 倍に見えた（原因は未切り分け）
- 遅いサーバへの POST が、送信プロセスの起動回数（10 回）より多い 27 回あった。計測のために毎回 `sent_at` を消したので、前の送信プロセスが終わる前に次が起動し、同じ spool ファイルを並行に送ったと推測する（送信プロセスに排他が無い）。本来は `sent_at` の 600 秒の間隔で起きにくいが、送信が 600 秒を超えて続く場合（遅いサーバ × 多数のファイル）には起こりうる。サーバ側の重複排除は確かめていない

## 課題と改善案

- **docs/knowledge/ に足す外界の事実**（Claude Code 2.1.283、この Mac で観測）:
  - hook の `command` の `python3` は利用者の PATH で解決される。pyenv のシムだと 1 回あたり約 0.4 s（単体）〜約 1 s（セッション中）が乗り、hook の処理（30〜60 ms）より 1 桁大きい
  - `claude -p` を未ログインで動かすと SessionStart と UserPromptSubmit だけが動き、Stop は動かない
  - 送信先が閉じている・10 秒応答しない場合も `-p` の起動時間は変わらない（切り離しが効いている）
- **利用者向けの問い合わせ対応（UC 85）**: 「起動が遅い」と言われたら、まず `command -v python3` がシム（pyenv・asdf など）かを確かめる。`time python3 -c pass` が 0.1 s を超えるならそれが主因。回避策の候補（設計判断が要る。提案のみ）: hooks.json の `python3` を変えるのは配布先で壊れうるので慎重に検討する
- **設計の論点（提案）**: 送信プロセスの多重起動の排他（ロックファイルなど）。サーバの event_id による重複排除の有無を先に確かめる
- **e2e/ の追加・修正**: E2E に時間の判定は入れない（ノイズが大きい）。代わりに `scripts/` に hook 単体の計時スクリプト（このフォルダの `bench_hooks.py` 相当。シムと実体の python3 の両方と sleep 入りのゲートを持つ）を置くと、UC 43 のプロンプトに 5 分で答えられる
- **e2e.md の修正**: 「E2E は所要時間を判定しない。計測は scripts/ の計時スクリプトで、load average を添えて相対比較する」と一文足す
- **e2e スキルの拡張**: 「処理時間を計って」と言われたら計時スクリプトへ誘導し、導入あり・なし・シムなしを交互に回すこと、sleep 入りのゲートを 1 回確かめること、load average を添えることを手順にする

## コードの変更

なし（開発ツリーの `plugin/`・`e2e/` は変えていない）。sleep 入りの版は組み立てコピーと installPath のコピーの中だけ。

## 片付けたもの・残したもの

- 隔離ルート（`$TMPDIR/cc-e2e-*`）はすべて `cleanup()` で削除済み。送信プロセス・ローカルの HTTP サーバの残りは無い（`ps` で確認）
- Docker 資源は作っていない
- 生の計測結果（各回の秒・負荷・行の種類）は `.local/e2e-load-testing/uc-43-hook-latency/`（`hooks.json`・`hooks-highload.json`・`start.json`・`auth-reply.json`・`auth-bash.json`・`stages.json`）。hook の入力の値は含まない
