# UC 24 非対話の起動とお知らせ（ユースケース集 24・87）

## 目的

`claude -p`・SDK 相当の起動・親から継承した `CLAUDE_CODE_ENTRYPOINT` の値の違いで、お知らせの既読の記録（`seen.json`）とブラウザを開く処理がどう扱われるかを、実物の claude 2.1.283 で確かめる。
非対話の起動が既読にしてしまい、対話で人に見せる前に消える経路が無いか。逆に「毎回出る」（87）の条件も洗う。

## 確かめる仮説（どう壊れうるか）

- H1: `-p` でも hook に `cli` が渡り、既読にしてブラウザを開く（非対話でブラウザが開く）
- H2: 親から入口の変数を継承した `-p` で、hook が非対話と判定せず、既読にして消える
- H3: SDK 相当（`--input-format stream-json`）で入口の値が変わり、判定が崩れる
- H4（87）: 既読を書けない・非対話と判定され続けると毎回出る。そのときブラウザも毎回開く

## 手順

判定の分岐（コード）: `plugin/hooks/session_start.py:73-82` の `_mark_seen_and_open` は、
`_browser.is_headless()`（値が `sdk-` 始まり）なら何もしない。それ以外は既読を書き、書けたときだけ、`is_interactive()`（値が `cli`）なら先頭の URL を開く。
開く処理は macOS で `subprocess.Popen(["open", url])`（`plugin/hooks/_browser.py:30`、PATH 解決）。

ブラウザの差し替え: PATH の先頭に偽の `open`・`xdg-open`（引数を記録して exit 0）を置く。URL は `https://uc24.invalid/notice?a=1`。

1. 段階 0（`direct.py`）: `shutil.which("open")` と子の python3 からの解決が偽を指し、偽が引数を記録することを確かめた。本物の `open` は呼ばない
2. 段階 1（`direct.py`）: `plugin/` の複製を一時ディレクトリに置き、`session_start.py` を直接呼んだ。入口の値を振る。陽性対照として `cli` で偽の `open` が呼ばれることを確かめた
3. 段階 2（`real.py`）: 隔離ルートに導入し、user の settings.json に probe の SessionStart hook（hook に渡る入口の値・`which open`・stdin のキーを記録）を足した。**url の無い**お知らせで、親から `cli` を継承させても hook から見た `open` が偽であることを確かめた（ここで偽でなければ中断する作り）
4. 段階 3（`real.py`）: installPath の `notices.json` を url 付きに差し替え、起動の形と継承した入口の値を振った。各ケースの前に `seen.json` と記録を消す
5. ゲートの確認（`real.py --mutant`）: installPath の `session_start.py` を壊し（非対話の早期 return を消し、対話判定を常に真）、同じ `-p` で既読と `open` の呼び出しが検出されることを確かめた
6. 認証あり（`real.py --auth`、haiku で 2 回）: ログイン済みでも同じか

負荷の掛け方: 負荷ではなく組み合わせ。実物の claude の起動は計 約 20 回（未ログイン 17・ログイン 2 を含む。うち段階 2 の安全確認が各実行 2 回）。API 費用は haiku 2 回分のみ。

## 結果

### hook に渡る `CLAUDE_CODE_ENTRYPOINT`（実測、claude 2.1.283、macOS）

| 起動 | 親から渡した値 | hook が見た値 | seen.json | 偽の open の呼び出し | systemMessage |
| --- | --- | --- | --- | --- | --- |
| `-p ok`（プレーン出力） | 無し | `sdk-cli` | 無し | 0 | 出力に現れない（既知） |
| `-p ok --output-format stream-json --verbose` ×2 | 無し | `sdk-cli` ×2 | 無し | 0 | 2 回とも出る |
| `-p --input-format stream-json --output-format stream-json --verbose`（SDK 相当、stdin は空） | 無し | `sdk-cli` | 無し | 0 | 出る（終了コード 0） |
| 同上 | `sdk-py` | `sdk-py` | 無し | 0 | 出る |
| `-p`（stream-json） | `cli` | `sdk-cli` | 無し | 0 | 出る |
| 同上 | `sdk-ts` / `sdk-py` | そのまま | 無し | 0 | 出る |
| 同上 | `claude-vscode` | `claude-vscode` | **書かれた** | 0 | 出る |
| 同上 | `foo`（未知） | `foo` | **書かれた** | 0 | 出る |
| 同上 | `""`（空） | `sdk-cli` | 無し | 0 | 出る |
| ログイン済み `-p ok --model haiku` | 無し / `cli` | `sdk-cli` / `sdk-cli` | 無し | 0 | （プレーン出力） |
| 変異版（判定を壊した）`-p` | 無し | `sdk-cli` | 書かれた | **1**（URL そのまま） | 出る |

- H1 は否定: `-p` では hook に `sdk-cli` が渡り、既読もブラウザも起きない。親の `cli` も `sdk-cli` に上書きされる
- H3 は否定: SDK 相当の起動でも `sdk-cli`、SDK が付ける `sdk-py` は保たれ、どちらも非対話と判定される
- **H2 は一部成立**: `-p` が上書きするのは `cli` と空だけで、**それ以外の値（`claude-vscode`・未知の値）は `-p` でもそのまま hook に届く。**`sdk-` 始まりでないので既読が書かれ、お知らせは人の目に触れないまま消える（ブラウザは開かない）
- claude 本体の静的な読み（2.1.283 の同梱 JS、minify 済みのため推測を含む）: 値が空でなければ保つ。例外は「`cli` かつ非対話 → `sdk-cli`」と `local_agent` → `local-agent` だけ。空なら `mcp serve` → `mcp`、`CLAUDE_CODE_ACTION` が真 → `claude-code-github-action`、それ以外は `-p` なら `sdk-cli`、対話なら `cli`。実測と矛盾しない

### 直接呼び出し（段階 1。hook のコードの分岐）

| 値 | 表示 | seen.json | open |
| --- | --- | --- | --- |
| `cli` | 出る | 書く | 1 回（陽性対照） |
| `cli` を 2 回 | 1 回目だけ出る | 書く | 1 回だけ |
| `sdk-cli`（2 回）・`sdk-ts`・`sdk-py` | 毎回出る | 無し | 0 |
| `claude-vscode`・未設定・空・`foo` | 出る | 書く | 0 |
| `cli` で data ディレクトリを読み取り専用（3 回） | **毎回出る** | 書けない | **0**（書けないときは開かない設計どおり） |

### 87「毎回出る」の条件（事実と推測を分ける）

- 実測: 入口が `sdk-` 始まり（`-p`・SDK）は設計どおり毎回出て既読にしない。data ディレクトリに書けないと、対話（`cli`）でも毎回出る。このときブラウザは開かない（毎回開く事故は無い）
- 推測（未検証。対話起動は禁止のため）: 対話の `claude` を、`CLAUDE_CODE_ENTRYPOINT=sdk-*` が残ったシェル（SDK のプログラムから起動した子など）から起動すると、静的な読みでは値が保たれるので、対話なのに非対話と判定され毎回出る

## 想定外だったこと

- `-p` による上書きは `cli` だけ。knowledge の「親から `cli` を継承しても `sdk-cli` に上書きされる」は正しいが、「ほかの値はそのまま残る」が抜けている
- 空文字は「未設定」と同じ扱い（`sdk-cli` になる）
- hook の環境には claude が付ける `CLAUDE_CODE_SESSION_ATTENDED`・`CLAUDE_CODE_CHILD_SESSION` などがあり（隔離 env の許可リストに無いので claude 自身が付けたもの）、同梱 JS では「人が付いているセッションから起動されたか」の判定に使われている。値は記録していない（キーのみ）。起動形態の判定のより良い手がかりになる可能性がある（推測）

## 課題と改善案

- 仕様の課題（バグ候補、直していない）: `plugin/hooks/session_start.py:75`（`if _browser.is_headless(): return`）と `plugin/hooks/_browser.py:18-20` の組み合わせで、「非対話だが入口の値が `sdk-` 始まりでない」起動は既読を書く。実例になりうるのは、VS Code 拡張やデスクトップアプリのセッションの Bash ツールから走る `claude -p`（親の値 `claude-vscode` などを継承。ツールの子に親の値が継承されることは、このセッションの Bash の環境に `cli` があることで確認。`claude-vscode` での継承は未確認）と、`CLAUDE_CODE_ACTION` 付きの CI（`claude-code-github-action`）。案: 既読を書く条件を「非対話でない」から「既知の対話の値（`cli`・`claude-vscode` など）」の許可リストに変える。ただし未知の値で毎回出る（87）側に倒れるため、どちらを選ぶかは判断が要る。影響は小さい（その前に対話で表示済みであることが多い。推測）
- `e2e/` の追加: `test_notices.py` は url を持たせないため、ブラウザを開かない判定がゲートしていない。偽の `open` を PATH の先頭に置き、url 付きのお知らせで `-p` を起動して「呼ばれない」を判定する案。そのためには `_root._EXTRA_KEYS` に `PATH`（とケースにより `CLAUDE_CODE_ENTRYPOINT`）を渡せるようにする必要がある。今回の変異版で、この判定が壊れた判定を落とすことを確認した。あわせて hook から見た `which open` が偽であることを先に判定する（本物を開かない安全装置）
- `e2e/` の追加（任意）: 親から `claude-vscode` を継承した `-p` で既読が書かれることの記録（上の仕様を決めた後に、決めた側を固定する）
- `docs/knowledge/claude-code-behavior.md` の `CLAUDE_CODE_ENTRYPOINT` の行に足す: 「`-p` が上書きするのは `cli` と空だけで、`sdk-ts`・`sdk-py`・`claude-vscode`・未知の値はそのまま hook に届く。`--input-format stream-json` でも `sdk-cli`（2.1.283 実測）」「`CLAUDE_CODE_ACTION` が真だと `claude-code-github-action`（2.1.283 の同梱 JS の静的な読み、未実測）」「SessionStart の stdin のキーは `cwd`・`hook_event_name`・`session_id`・`source`・`transcript_path`（`-p`、2.1.283）」
- `docs/guide/e2e.md`: ブラウザを開く経路を確かめる手順（PATH の先頭に偽の `open`、まず url 無しで hook から見た `which open` を確かめてから url 付きへ）を書く
- ユースケース集 87 の手順書: 聞く項目に「その人のシェルの `CLAUDE_CODE_ENTRYPOINT`（`echo`）」と「data ディレクトリの書き込み可否」を足す

## 未実施・未検証

- 対話起動（禁止）。対話で `sdk-*` を継承したときに毎回出るかは静的な読みからの推測
- 本物の Agent SDK（未導入）。SDK 相当は起動引数と入口の値で模した
- VS Code 拡張・デスクトップアプリが統合ターミナルやツールの子に `CLAUDE_CODE_ENTRYPOINT` を渡すか
- Linux の `xdg-open`（`_browser.open_url` は macOS と Windows 以外で何もしないため、偽の `xdg-open` は呼ばれない想定で、呼ばれていない）

## 片付けたもの・残したもの

- 一時ディレクトリ `$TMPDIR/cc-e2e-a-24-*` は各スクリプトの終わりで消し、無いことを確認した。起動したプロセスは残っていない。Docker は使っていない
- `plugin/` に `__pycache__` を作っていない（複製から呼び、`PYTHONDONTWRITEBYTECODE=1`）
- 残したもの: このフォルダのスクリプト（`uc24_lib.py`・`direct.py`・`real.py`）。生の結果 JSON は `.local/e2e-load-testing/uc-24-noninteractive-notices/`（`direct.json`・`real.json`・`real-auth.json`・`real-mutant.json`。一時パスを含むため git に入れない）
