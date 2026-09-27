# UC 13: 壊れた settings.json（ユースケース集の 13・11）

## 目的

利用者の `settings.json` が壊れている・型が違う・巨大・読み取り専用・シンボリックリンクのとき、
実物の Claude Code（2.1.283）とプラグインの SessionStart hook がどう振る舞うかを観測する。

- プラグインが修復・上書きを試みず何も書かずに済ませるか。書くならバックアップが取られるか
- Claude Code 本体が起動するか・何を表示するか・本体が先に書き換えないか
- hook が exit 0・stderr 無出力を守るか
- policy 行・error 行に何が残るか

## 確かめる仮説（どう壊れうるか）

1. 本体が壊れたファイルを無視すると `enabledPlugins` も読めず、プラグインが**そもそも動かない**（hook 以前の問題）
2. BOM 付きは Python の `json.loads` が拒否するので `parse_failed`。本体は受け付けるかもしれず、両者で解釈が食い違う
3. トップが配列・途中の型違い（`env` が文字列、`extraKnownMarketplaces` が配列）で hook が例外を漏らす
4. 巨大なファイルで hook が 5 秒のタイムアウトを超え、書きかけ・バックアップだけ残る
5. 読み取り専用のファイルを `os.replace` が黙って置き換える（利用者の意図を無視し、権限も 0600 に変わる）
6. シンボリックリンクがリンクのまま保たれず、普通のファイルに化ける。宙づりのリンクでリンク先に新しいファイルを作る
7. 型の違う値（`autoUpdate` が `1` / `"true"`）が一致とみなされ上書きされない（UC 11）

## 手順

一時スクリプト `run_uc13.py`（`e2e/` の `_root`・`_flow`・`_githttp`・`_market` を import）。

1. 隔離ルート `$TMPDIR/cc-e2e-a-13-*` を作り、ローカル git 配信から開発ツリーの `plugin/` を user に導入する（未ログイン）
2. 導入直後の `settings.json` を「基準」として控える（標準設定は未適用なので、hook が動けば書き込みが要る状態）
3. ケースごとに、状態（`governance/`・キュー・spool）を消し、`settings.json` をケースの形にしてから
   - (a) `claude -p ok --output-format stream-json --verbose --include-hook-events`（未ログイン）を 1 回
   - (b) 別のリセットの後、installPath の `session_start.py` を直接起動（exit code・stderr・所要時間を測る）
4. 前後で `settings.json` のバイト・権限・リンクの状態、バックアップ、policy 行・error 行を比べる
5. 本体の読み方の対照として、`enabledPlugins` をプロジェクトの `.claude/settings.json` にも置く変種を一部で流す

## 負荷の掛け方

壊れた JSON（途中で切れた）・空ファイル・BOM 付き・非 UTF-8・深い入れ子・トップが配列 / null・
`env` が文字列・`extraKnownMarketplaces` が配列・`autoUpdate` が `1` / `"true"`・
巨大なファイル（1 / 10 / 40 MB）・読み取り専用（chmod 444）・変更不可フラグ（`chflags uchg`）・
シンボリックリンク（隔離ルート内を指す）・宙づりのシンボリックリンク。

## 結果

測定条件: macOS・`claude` 2.1.283・hook の `python3` は 3.13.2（pyenv）・未ログインの `claude -p`（認証ありは 2 ケースだけ haiku で追加）。
所要時間は 1 回の測定で、相対比較にだけ使う。生の結果は `.local/e2e-load-testing/uc-13-broken-settings/run*.json`。
「user のみ」は導入どおり `enabledPlugins` が利用者の `settings.json` にだけある状態、
「proj も」はプロジェクトの `.claude/settings.json` にも `enabledPlugins` を置いた対照である。

判定がゲートしていることの確認: 基準（正常）ケースではバイト（sha256）・権限・バックアップ・policy 行がすべて変化し、
比較が変化を検出できることを確かめた。以下の「不変」はこの比較による。

### ケース別（hook は全ケースで exit 0・stderr 空。本体経由・直接起動の両方で観測）

| ケース | 本体がプラグインを読んだか（user のみ） | settings.json（hook 実行時） | バックアップ | policy 行 |
| --- | --- | --- | --- | --- |
| 基準（正常・未適用） | 読んだ | 書き換え。**権限 0644→0600** | 1（元と一致） | applied ×2 |
| 途中で切れた / 末尾カンマ / 空 / トップが配列 / トップが null | **読まない（hook も動かない）** | 不変 | 0 | proj ありのときだけ parse_failed ×2 |
| BOM 付き | **読んだ** | 不変 | 0 | parse_failed ×2 |
| 非 UTF-8（Latin-1） | **読んだ** | 不変 | 0 | parse_failed ×2 |
| 5000 段の入れ子（10 KB） | 読んだ | 書き換え。**10 KB → 50 MB に膨張** | 1 | applied ×2 |
| `env` が文字列 | **読まない** | proj ありなら autoUpdate だけ書く | 1 | env=skipped_missing・autoUpdate=applied |
| `extraKnownMarketplaces` が配列 | 読んだ | env だけ書く | 1 | env=applied・autoUpdate=skipped_missing |
| `autoUpdate` が `1` / `"true"`、env の値が数値 60 | 読んだ | 上書き（型違いを一致とみなさない） | 1 | applied、prev_value は `1` / `true` / `60` |
| 1 MB（permissions.allow を水増し） | 読んだ | 書き換え | 1（1.1 MB） | applied |
| 5 / 10 / 40 MB | **読まない** | （proj ありなら）書き換え | 1（46 MB） | applied |
| 読み取り専用（chmod 444） | 読んだ | **書き換え、権限は 0600 に** | 1 | applied |
| 変更不可（`chflags uchg`） | 読んだ | 不変 | **1（書けないのに取る）** | write_failed ×2 |
| シンボリックリンク（ルート内を指す） | 読んだ | リンクのまま、リンク先を書き換え（0600） | 1 | applied |
| 宙づりのシンボリックリンク | 読まない | proj ありなら**リンク先の親ディレクトリを作ってファイルを新規作成** | 0 | env=applied・autoUpdate=skipped_missing |
| ファイルが無い | 読まない | proj ありなら env だけの新規ファイル（0600） | 0 | 同上 |

- **本体の読み込みの上限は 2 MiB**: 余白の文字列で水増しすると、2,097,142 バイトは読み、2,097,162 バイトは読まない（1.5 MB 以下は読む）。
  permissions の水増しでも 1.1 MB は読み、5.8 MB 以上は読まない。境界はバイト数で決まる（推定: 2 MiB = 2,097,152 バイト）
- **本体は、読まない settings.json を黙って無視する**: `-p` では stderr・stream-json・終了コード（認証ありで 0）のいずれにも警告が出ず、応答は普通に返った（`claude --help` の「Settings files that fail validation are silently ignored in this mode」どおり）。対話起動でのエラー表示は**未検証**
- **本体は壊れた settings.json を書き換えない**: user のみで本体がプラグインを読まなかった全ケースで、バイトは不変だった
- hook の直接起動の所要時間: 40 MB で 1.66 秒、本体経由（proj あり）でも SessionStart は timeout 5 秒の内に成功した。1 回の測定
- error 行はどのケースでも 0 件（設計どおり。読めない・書けない結果は policy 行の apply_result に載る）
- `uchg` を 3 セッション続けると、同じ内容のバックアップが 3 個増えた（書けないのに毎回取る）
- 対照（proj あり）の一部で、本体が `plugins/installed_plugins.json` に `scope: project` の記録を足した（BOM・Latin-1・入れ子・EKM 配列）。
  利用者の設定を本体が読めたときだけ起きた。本 UC の範囲外の上流の挙動として記録する（推定: 利用者の設定のマーケットプレイス登録が要る）

## 想定外だったこと

1. **仮説 1 が当たった: 壊れた settings.json では、プラグインは何も書かないのではなく、そもそも起動しない。**
   導入は `enabledPlugins` を利用者の `settings.json` にだけ書くので、本体がそのファイルを捨てると hook が 1 本も動かない。
   **policy 行（parse_failed）も error 行も利用ログも届かない**ため、サーバからは「その端末が使っていない」と区別できない。
   `parse_failed` の行が実際に届くのは、本体は読めて Python は読めない BOM 付き・非 UTF-8 の場合（とプロジェクトの設定で有効化した場合）だけである
2. **型の違う値（`env` が文字列）も本体はファイルごと捨てる。**JSON として正しくてもスキーマ違反でプラグインが止まる
3. **2 MiB を超える settings.json を本体は黙って捨てる**（上と同じく、プラグインごと止まる）
4. **BOM 付き・非 UTF-8 では、本体は読むのにプラグインは parse_failed で何も適用しない。**両者の解釈が食い違い、標準設定が永久に当たらない（行は届くので気づける）
5. **書き込むと権限が 0600 に変わる**（`mkstemp` の既定）。読み取り専用（0444）も黙って上書きされる。利用者が意図して読み取り専用にした設定を尊重しない
6. **書けない（uchg）ときも毎セッションでバックアップを取る。**10 世代の回転で、書き換え前の本当のバックアップが押し出される
7. **宙づりのシンボリックリンクでは、リンク先に親ディレクトリごと新しいファイルを作る**（`mkdir(parents=True)`）
8. **書き換えで整形が `indent=2` に変わる。**深い入れ子では 10 KB が 50 MB に膨らんだ（病的な入力だが、書き換えのたびに利用者の整形・キー順以外の表記は失われる）

## 課題と改善案

### プラグイン（バグ・仕様の穴と思われるもの。直すなら別の作業）

- `plugin/hooks/_settings.py:76-80`: バックアップを `os.replace` の前に取るため、置換が失敗（uchg・EPERM）しても毎回バックアップが増え、10 世代の回転で本物のバックアップが消える。
  案: 置換の失敗時に今回のバックアップを消す、または直前のバックアップと同じ内容なら取らない
- `plugin/hooks/_settings.py:60`・`:80`: `mkstemp` の 0600 で置き換えるので、元の権限（0644・0444）が失われる。
  案: 置換前に元の `st_mode` を一時ファイルへ `chmod` で写す。読み取り専用（書き込みビットが無い）なら書かずに `write_failed`（か新しい結果名）にするかは仕様判断
- `plugin/hooks/_settings.py:59`: 宙づりのリンクの先に `mkdir(parents=True)` でディレクトリを作る。案: `missing` かつリンクだったときは書かない
- 仕様（`docs/spec/plugin.md` の「設定の自動適用」）: 「パースに失敗したら何もしない」は正しいが、**本体が読めないファイルではプラグインが起動しない**ことと、そのとき端末から何も届かないことが書かれていない。
  監視の設計（「行が来ない端末」を利用者の不使用と区別できない）に関わるので、仕様か `docs/remaining/` に残すべき
- BOM: 本体が受け付ける以上、`_load` で `utf-8-sig` として読む案がある（書き戻しは BOM なしになる。利用者のファイルを変える判断なので仕様判断）

### `docs/knowledge/claude-code-behavior.md` に足す外界の事実（2.1.283・隔離環境・`-p` で観測）

- 利用者の `settings.json` が JSON として壊れている・トップが配列 / null・空・`env` が文字列（スキーマ違反）・2 MiB を超えるとき、本体はファイル全体を黙って無視し、`enabledPlugins` も効かないので、そこで有効化したプラグインは読み込まれず hook も動かない。`-p` では警告も出ず、終了コードも変わらない
- 本体は BOM 付き・非 UTF-8（Latin-1）の `settings.json` を読む。`extraKnownMarketplaces` が配列でも読む
- 本体は無視した `settings.json` を書き換えない
- 読み込みの上限: 2,097,142 バイトは読み、2,097,162 バイトは読まない（2 MiB 付近）

### `e2e/`・`tests/` の追加・修正案

- E2E に昇格させる価値があるのは「**本体が捨てる settings.json ではプラグインが動かない**」の 1 本だけ（上流の版で変わりうる・無言で壊れる）。
  認証不要・Docker 不要で数秒。`test_settings.py` に「壊した settings.json で `session()` → `hook_rows` が空・バイト不変」を足す。
  上流が扱いを変えて hook が動くようになれば落ちるので、その時に parse_failed の経路を見直す合図になる
- 残り（BOM・型違い・権限・uchg・リンク）の網羅は `tests/` の単体テストへ。特に uchg のバックアップ増殖と権限の保存は、修正するなら単体テストで先に落ちることを確かめる
- 一時スクリプトの部品として、`E2ERoot` の prefix を変えられると並行の約束（`cc-e2e-<トラック>-<UC>-*`）に合わせやすい（今回は `tempfile.mkdtemp` を差し替えた）。
  `_flow.install_path` は `scope: project` の記録が足されると `len == 1` の assert で落ちる（本体がプロジェクトの有効化で記録を足すため）。E2E の現状の使い方では起きない

### `docs/guide/e2e.md`・e2e スキル

- 「E2E が見ていないもの」に、壊れた利用者設定ではプラグインが起動しない（=parse_failed は E2E でも実運用でも普通は観測されない）ことを書く
- スキルの手動確認の手順（UC 13 の「スキルでできること」）は「policy 行が parse_failed であることを見る」としているが、導入どおりの状態では行が 1 行も出ない。
  手順を「hook が動かないこと（行が空・バイト不変）を見る。parse_failed を見たければ BOM 付きを使う」に直す

## 片付けたもの・残したもの

- 隔離ルート `$TMPDIR/cc-e2e-a-13-*` は各実行の終わりに消した（残骸なしを確認）。プロセスの残りなし。Docker は使っていない
- `heavy.lock` は巨大ファイル（10〜40 MB）を含む 2 回の実行の間だけ取り、外した
- 残したもの: 一時スクリプト `run_uc13.py`・`cases.py`（このフォルダ）、生の結果 `.local/e2e-load-testing/uc-13-broken-settings/run*.json`（隔離ルートのパスと応答文だけで、認証の値は無いことを確認した）
- コード（`plugin/`・`e2e/`）は変えていない
- `~/.claude/cc-governance/identity.json`（9/26 付）が本物の側にあるが、本 UC より前から在るもので触っていない。`e2e/__pycache__/` は gitignore 対象で、並行するほかの UC も使うので残した
