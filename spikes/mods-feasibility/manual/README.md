# Mods 移行の手動検証（会社 PC・Windows）

governance プラグインを Claude Code の Mods（TypeScript の関数フック）へ移す前に、会社 PC（Amazon Bedrock 認証・VPN）と
Windows 端末でしか確かめられないことを、手で確かめるための手順書。項目は優先度の高い順に並べてある。
各項目の「貼り返す欄」を埋めて、結果をそのまま返してほしい。途中の項目だけでもよい。

## 前提

| 項目 | 内容 |
|---|---|
| Claude Code | 2.1.288（`claude --version`）。違う版で行ったときは、その版を貼り返す欄に書く |
| 取得 | このブランチ（`spike/mods-feasibility`）を GitHub から取得し、`spikes/mods-feasibility/manual/` で作業する |
| Python | 3.9 以上（補助スクリプト用。標準ライブラリだけを使う）。Windows で `python` が無ければ `py -3` に読み替える |
| 所要時間 | 項目 1〜3 で約 30 分。項目 4 は約 20 分。項目 5 は Bitbucket の準備を除いて 30〜60 分（自動更新の待ちを含む）。項目 6 は約 10 分、項目 7 は約 15 分 |
| 費用 | モデルを呼ぶのは項目 2 の 1 回だけ（haiku 相当、1 ターンでモデルへの要求は 2 回程度。入力は 1 回あたり 2〜3 万トークンで、大半はシステムプロンプト）。項目 2 の任意の手順を行うと 1〜2 回増える。ほかの項目はモデルを呼ばない |

モデル ID は、利用者の Bedrock の環境で使えるものに合わせる。以下では `FEAS_MODEL` に入れて使う
（`haiku` のエイリアスが社内の設定で使えるならそれでよい。使えなければ、利用できる安いモデルの ID を直接入れる）。

### 会社 PC で確かめ済みのこと（2026-10-02、2.1.287、macOS、Bedrock）

- `--plugin-dir` の mod は `-p` でも対話でも読み込まれ、コマンド・`tool.call`・`$.state`・ステータス表示・Pane が動いた
- managed settings は無かった（`/Library/Application Support/ClaudeCode/` が無い）。debug に
  `cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization (none)`
- `--safe-mode` と `--plugin-dir` を併用すると mod は読み込まれない。**この手順では `--safe-mode` を付けない**
- 対話では、フォルダの信頼を承認するまで mod は読み込まれない（`-p` は信頼の確認を飛ばして読み込む）。対話の項目は信頼済みのフォルダで行う
- 2.1.285 では、対話のセッションを resume すると SessionStart の systemMessage が表示されなかった（新規では表示された）

このため項目 1 と項目 2 の読み込みの確認は、2.1.288 で変わっていないかを見る軽い再確認にしてある。

### このマシンで確かめた範囲

- 検証用 mod（`feas-field/`）の読み込みと、`/feas-field` の各コマンド（`info`・`log`・`py`・`fetch`（localhost）・`detach`・`hold`・`ui`）、
  起動直後のバンド（新規・`claude --resume`・`/resume`）、受信器（`tools/recv.py`）、切り離しの確認（`tools/detach_check.py`）、
  置き換えの確認（`tools/replace_check.py`）は、macOS（zsh）で、このとおりのコマンドで動くことを確かめた。
  モデルは呼んでいない（項目 2 の 1 本目と、Bedrock の下での値は未確認）
- **Windows（PowerShell）のコマンドはすべてこのマシンでは未確認。**書いたとおりに動かなければ、エラーをそのまま貼り返してほしい

## 安全規則（すべての項目で守る）

- **本人の `~/.claude` の設定を書き換えない。**mod の読み込みは `--plugin-dir`、hook の追加は `--settings <一時 JSON>` で行い、
  どちらもそのセッションにだけ効かせる。`claude plugin install`・`claude plugin marketplace add`・`/plugin` での導入を本人の設定で行わない
- 隔離した `CLAUDE_CONFIG_DIR` を使うのは項目 4b（スクリプトが一時ディレクトリを作る）と項目 5 だけ。
  **隔離すると `~/.claude/settings.json` の Bedrock の設定（`env` の `CLAUDE_CODE_USE_BEDROCK`・`AWS_*` など）が引き継がれない。**
  この 2 項目はモデルを呼ばない手順にしてある。ほかの項目は本人の設定のまま行う（Bedrock が要る）
- **本番の受信先に送らない。**送信は localhost の受信器（ポート 18850）か、利用者が指定する検証用の受信先だけ。
  mod は localhost 以外への送信を、起動時に `FEAS_ALLOW_REMOTE=1` を付けたときだけ行う
- managed settings・システム領域（`/Library/Application Support/ClaudeCode/`・`C:\Program Files\ClaudeCode\`・`HKLM`）は**読むだけ**。
  書き込む検証は付録 A に分けた。**管理者権限が要り、その端末の全利用者に効く。情報システム部門の了解を得てから行う**
- Claude Code のセッションの中（`!` や Bash ツール）からではなく、普通のターミナルから実行する
- 会社 PC に governance プラグインが入っていれば、検証のセッションもいつもの利用として記録・送信される。この手順はその送信先を変えない
- 対話の初期設定でターミナル設定（Shift+Enter）を勧められたら「No」を選ぶ（「Yes」は本人のターミナルや IDE の設定を書き換える）
- 終わったら「片付け」を行う

## 共通の準備

macOS（zsh）:

```zsh
cd <取得したリポジトリ>/spikes/mods-feasibility/manual
export FEAS="$PWD"
export FEAS_MODEL='<Bedrock で使えるモデル ID か haiku>'
export FEAS_OUT="$(mktemp -d)"   # debug ログの置き場。片付けで消す
claude --version
claude plugin validate "$FEAS/feas-field" --strict   # 最後に「✔ Validation passed」
```

Windows（PowerShell。このマシンでは未確認）:

```powershell
cd <取得したリポジトリ>\spikes\mods-feasibility\manual
$env:FEAS = (Get-Location).Path
$FEAS_MODEL = '<Bedrock で使えるモデル ID か haiku>'
$FEAS_OUT = (New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("feas-out-" + (Get-Random)))).FullName
claude --version
claude plugin validate "$env:FEAS\feas-field" --strict
```

`/feas-field` はモデルを呼ばない。出力はメールアドレス・12 桁の番号・長いトークン・ホームのパス・端末名・プロキシのホスト名を伏せてある
（長さだけ出す）。それでも貼り返す前に一度目で確かめ、ユーザー名・ホスト名・社内の URL が残っていれば伏せてほしい。

---

## 1. managed settings と sec-default の再確認（読むだけ）

**目的:** 2.1.288 でも managed settings が無く、sec-default が座らないことを確かめる（2.1.287 では座らなかった）。
握り潰しへの対策（governance を prepend に置くか、sec-default に任せるか）がこれで決まる。Windows 端末でも同じ手順で行う。

macOS:

```zsh
command ls -la "/Library/Application Support/ClaudeCode/" 2>&1
command ls -la "/Library/Managed Preferences/" 2>&1 | grep -i anthropic
claude -p "/feas-field info" --plugin-dir "$FEAS/feas-field" --debug-file "$FEAS_OUT/item1.debug.log"
grep -E 'sec-default|prependPlugins|hooks module feas-field.*loaded' "$FEAS_OUT/item1.debug.log" | cut -c1-240
```

Windows（未確認）:

```powershell
Get-ChildItem 'C:\Program Files\ClaudeCode' -Force -ErrorAction SilentlyContinue | Select-Object Name, Length, LastWriteTime
foreach ($k in 'HKLM:\SOFTWARE\Policies\ClaudeCode', 'HKCU:\SOFTWARE\Policies\ClaudeCode') {
  "$k exists=$(Test-Path $k) values=$((Get-ItemProperty $k -ErrorAction SilentlyContinue).PSObject.Properties.Name -join ',')"
}
claude -p "/feas-field info" --plugin-dir "$env:FEAS\feas-field" --debug-file "$FEAS_OUT\item1.debug.log"
Select-String -Path "$FEAS_OUT\item1.debug.log" -Pattern 'sec-default|prependPlugins|hooks module feas-field.*loaded' | ForEach-Object { $_.Line.Substring(0, [Math]::Min(240, $_.Line.Length)) }
```

**期待する結果と判定:**

| 見えたもの | 判定 |
|---|---|
| `settings.policyKeys` が `[]`、debug に `not seated: no managed settings and not a Team or Enterprise organization` | 前回と同じ。利用者 settings の `prependPlugins` が効く端末 |
| `settings.policyKeys` が空でない、または debug に `seated outermost` | 前回から変わった。利用者 tier の mod に `classic.*` が届かなくなる。対話の `/status` の `Setting sources` の行も貼り返す |

`tier` は、この mod 自身が読み込まれた順位（`user` が普通）。debug の `hooks module feas-field@inline loaded (… tier …)` と同じになるはず。
`/feas-field info` の出力は項目 4c でも使う（Windows で取ったものは項目 4c の欄に貼る）。

**貼り返す欄:**

```text
Claude Code の版 / OS:
ClaudeCode ディレクトリの一覧・Managed Preferences / レジストリの有無（値の名前だけ）:
/feas-field info の出力（全文）:
debug の grep 結果:
```

---

## 2. Bedrock での usage と独自イベント

**目的:** Bedrock 認証の下で、`turn.complete` の `e.usage`（トークン数）と `$.session.usage().context`（コンテキストの使用量）に値が入るか。
独自イベント（`turn.*`・`tool.call`・`command.run`・`session.compact`）と `classic.*` が何回届くかを数える。モデルを 1 回呼ぶ。

macOS:

```zsh
SID=$(uuidgen | tr 'A-Z' 'a-z'); echo "$SID"
claude -p "Bash ツールで echo hi を 1 回だけ実行し、結果を一言で答えて" --model "$FEAS_MODEL" \
  --session-id "$SID" --allowedTools "Bash(echo hi)" \
  --plugin-dir "$FEAS/feas-field" --debug-file "$FEAS_OUT/item2.debug.log"
claude -p "/feas-field log" --resume "$SID" --plugin-dir "$FEAS/feas-field"
```

Windows（未確認）:

```powershell
$SID = [guid]::NewGuid().ToString(); $SID
claude -p "Bash ツールで echo hi を 1 回だけ実行し、結果を一言で答えて" --model $FEAS_MODEL `
  --session-id $SID --allowedTools "Bash(echo hi)" `
  --plugin-dir "$env:FEAS\feas-field" --debug-file "$FEAS_OUT\item2.debug.log"
claude -p "/feas-field log" --resume $SID --plugin-dir "$env:FEAS\feas-field"
```

2 本目はモデルを呼ばず、1 本目の記録（`previousProcesses`）と、2 本目自身の記録（`thisProcess`。`command.run` が入る）を出す。
`SID` は項目 6 でも使うので控えておく。

**期待する結果と判定**（`previousProcesses` を見る）:

| 欄 | 期待 | 判定 |
|---|---|---|
| `counts` の `session.start`・`prompt.submit`・`turn.start`・`turn.complete`・`session.end` | 各 1 以上 | 0 なら独自イベントが Bedrock の下で届いていない |
| `counts` の `turn.step`・`tool.call` | `turn.step` 2 前後、`tool.call` 1 以上 | `tool.call` が 0 なら Bash が許可されなかった（1 本目の出力を貼る） |
| `counts` の `classic.*` | 項目 1 が前回と同じなら `classic.SessionStart`・`UserPromptSubmit`・`PostToolUse`・`Stop`・`SessionEnd` が各 1 以上。sec-default が座っていたら 0（欄ごと無い） | sec-default なしで 0 なら想定外 |
| `turns[].usage` | `input_tokens`・`output_tokens`・`cache_*` に数値、`model` に ID | `null` なら Bedrock では `e.usage` が入らない |
| `turns[].contextAtComplete.tokens` | 数値（2〜4 万程度） | 無ければ `$.session.usage().context.tokens` が入らない |
| `lastStep.effort` | haiku なら `<absent>` | 値があれば記録する |
| `thisProcess.counts.command.run` | 1 | 0 なら mod のコマンドで `command.run` が届いていない |

**任意（モデルの呼び出しが増える）:**

- 圧縮: `claude -p "/compact" --resume "$SID" --plugin-dir "$FEAS/feas-field"` の後に、もう一度 `/feas-field log` を `--resume` で実行する。
  `previousProcesses.counts` に `session.compact`（と sec-default が無ければ `classic.PreCompact`）が増えれば届いている（要約のためにモデルを 1 回呼ぶ）
- effort: effort に対応したモデル（Sonnet・Opus 相当）で 1 本目だけを別の `SID` でもう一度行い、`lastStep.effort` に値が入るかを見る

**貼り返す欄:**

```text
FEAS_MODEL に使ったモデル（ID の形だけでよい）:
1 本目の出力:
/feas-field log の出力（全文）:
任意の /compact 後の log / effort 対応モデルでの lastStep:
```

---

## 3. `$.http.fetch` が社内のプロキシと CA を越えて届くか

**目的:** mod の送信（`$.http.fetch`）が、社内のプロキシ（`HTTPS_PROXY`）と社内 CA（OS の証明書ストア・`NODE_EXTRA_CA_CERTS`）の下で届くか。
公式の docs では、本体は既定で同梱の CA と OS の証明書ストアの両方を信頼する（`CLAUDE_CODE_CERT_STORE`、debug の `CA certs: stores=bundled,system`）。
mod の送信も同じかは未確認。

### 3a. localhost の受信器（必ず行う）

ターミナルを 2 つ使う。1 つ目で受信器を立てる（10 分で自動で止まる。先に止めるときは Ctrl+C）。

```zsh
python3 "$FEAS/tools/recv.py" --port 18850          # macOS
```

```powershell
python "$env:FEAS\tools\recv.py" --port 18850        # Windows（未確認）
```

2 つ目で送る（2 つ目のターミナルでも「共通の準備」を行っておく）。

```zsh
claude -p "/feas-field fetch POST http://127.0.0.1:18850/ingest" --plugin-dir "$FEAS/feas-field" --debug-file "$FEAS_OUT/item3.debug.log"
grep -E 'CA certs|[Pp]roxy' "$FEAS_OUT/item3.debug.log" | cut -c1-200
```

```powershell
claude -p "/feas-field fetch POST http://127.0.0.1:18850/ingest" --plugin-dir "$env:FEAS\feas-field" --debug-file "$FEAS_OUT\item3.debug.log"
Select-String -Path "$FEAS_OUT\item3.debug.log" -Pattern 'CA certs|[Pp]roxy' | ForEach-Object { $_.Line.Substring(0, [Math]::Min(200, $_.Line.Length)) }
```

期待: `{"status":200,"ok":true,...}`、受信器に `"method": "POST"` と `"user-agent": "Bun/…"` の行が 1 つ出る。
`HTTPS_PROXY` が設定された端末で失敗したら、localhost への送信がプロキシに回されている可能性がある（`NO_PROXY` に localhost が無い）。結果をそのまま貼る。

### 3b. 検証用の受信先（受信先があるときだけ）

送ってよい検証用の受信先（本番ではないもの）があるときだけ行う。無ければ「未実施」と書く（その場合、プロキシ越しの到達は未確認のまま残る）。
まず本文の無い GET で到達だけを見て、受信先が受け付けるなら POST も試す。比較のため、同じ URL へ curl でも届くかを見る。

```zsh
URL='<検証用の受信先の URL>'
curl -sS -o /dev/null -w 'curl http_code=%{http_code}\n' "$URL"
FEAS_ALLOW_REMOTE=1 claude -p "/feas-field fetch GET $URL" --plugin-dir "$FEAS/feas-field"
FEAS_ALLOW_REMOTE=1 claude -p "/feas-field fetch POST $URL" --plugin-dir "$FEAS/feas-field"
```

```powershell
$URL = '<検証用の受信先の URL>'
curl.exe -sS -o NUL -w "curl http_code=%{http_code}`n" $URL
$env:FEAS_ALLOW_REMOTE = '1'
claude -p "/feas-field fetch GET $URL" --plugin-dir "$env:FEAS\feas-field"
claude -p "/feas-field fetch POST $URL" --plugin-dir "$env:FEAS\feas-field"
Remove-Item Env:FEAS_ALLOW_REMOTE
```

**判定:** `status` が出れば（4xx を含む）ネットワークとしては届いている。`error` が出たら符号で分ける。

| `error` | 意味（推測を含む） |
|---|---|
| `ENOTFOUND` | 名前解決できない。プロキシを通っていない可能性 |
| `ECONNREFUSED`・`TIMEOUT`・`ABORTED_30S` | 接続できない・応答が無い |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE`・`SELF_SIGNED_CERT_IN_CHAIN`・`DEPTH_ZERO_SELF_SIGNED_CERT` など証明書の語 | 社内 CA を信頼していない |

curl が届き mod が届かないときは、mod の送信路の問題として記録する。

### 3c. 対話での許可確認（受信先があるときだけ）

対話で localhost 以外へ送ったときに、許可を求める画面が出るかを見る。

```zsh
FEAS_ALLOW_REMOTE=1 claude --plugin-dir "$FEAS/feas-field"
# 起動したら /feas-field fetch GET <検証用の受信先の URL> を打ち、画面に何が出たかを記録して /exit
```

```powershell
$env:FEAS_ALLOW_REMOTE = '1'; claude --plugin-dir "$env:FEAS\feas-field"; Remove-Item Env:FEAS_ALLOW_REMOTE
```

**貼り返す欄:**

```text
3a の出力と、受信器に出た行:
3a の debug の grep 結果:
3b の curl の結果 / GET の出力 / POST の出力（未実施ならそう書く）:
3c で許可の画面が出たか（出たなら文言）:
info の env 欄の HTTPS_PROXY・NO_PROXY・NODE_EXTRA_CA_CERTS・CLAUDE_CODE_CERT_STORE（項目 1 の出力にある）:
```

---

## 4. Windows の項目

macOS でも動くが、知りたいのは Windows での結果。すべてモデルを呼ばない。

### 4a. 切り離した送信プロセスが本体の終了後も生き残るか

**目的:** 送信は「mod が判定し、切り離した Python が送る」設計にする。Windows では、本体（Bun）が子をジョブオブジェクトに入れ、
本体の終了で子を殺す可能性がある（二次資料からの推測）。今の Python 版（`_sender.launch()` と同じ `Popen`）と、候補の起動方法のどれが生き残るかを確かめる。

スクリプトは claude を `--plugin-dir` と一時の `--settings`（SessionEnd hook を 1 つ足すだけ）で起動し、次の方法で子を起動させる。
子は、スクリプトが「claude が終了した」印を置くまで待ち、その 3 秒後に完了の印を書く。完了の印が書けた方法が生き残った方法になる。
本人の設定のまま動かす（`--settings` はそのセッションにだけ効く）。

| 名前 | 起動のしかた |
|---|---|
| `hook:popen` | settings の SessionEnd hook → Python が `Popen(start_new_session=True)`（今の `_sender.launch()` と同じ） |
| `mod-py:popen` | mod の `$.process.run` → Python が同じ `Popen` |
| `mod-py:breakaway` | 同上で `DETACHED_PROCESS`・`CREATE_NEW_PROCESS_GROUP`・`CREATE_BREAKAWAY_FROM_JOB` |
| `mod-py:cmd-start` | 同上で `cmd /c start "feas" /b` |
| `mod-py:start-process` | 同上で PowerShell の `Start-Process` |
| `mod-py:wmi` | 同上で WMI（`Invoke-CimMethod Win32_Process Create`） |
| `mod:start-process` | mod の `$.process.run` から直接 PowerShell の `Start-Process` |

macOS では `hook:popen`・`mod-py:popen`・`mod-py:nohup`・`mod:sh-nohup` の 4 つを試す。

```powershell
python "$env:FEAS\tools\detach_check.py" run                 # -p で起動（30 秒ほど）
python "$env:FEAS\tools\detach_check.py" run --interactive   # 対話。起動したら /feas-field detach を実行し、出力を見てから /exit
```

```zsh
python3 "$FEAS/tools/detach_check.py" run      # macOS（このマシンでは 4 つとも survived=true。子を 1 つ途中で殺すとその行は false になることも確認）
```

コンソールの窓が一瞬開くことがある。WMI や PowerShell の起動をセキュリティ製品が警告したら、そこで止めて警告の内容を貼り返してほしい。
途中で止めた場合、待っている子は最長 10 分で自分で終わる（片付けの確認で残っていなければよい）。

**判定:** `survived: true` の方法は、本体の終了後も生き残った。`started: false` はその方法で子が起動しなかった（`error` を見る。
`hook:popen` が `started: false` なら、hook のコマンドがシェルに解釈されなかった可能性がある）。
`hook:popen` が `survived: false` なら、今の governance も Windows では送信プロセスが本体と一緒に止められている可能性が高い。

### 4b. settings.json の原子的な置き換え（`os.replace`）

**目的:** 設定の自動適用は、読み込み・SET/ADD/REMOVE/ONCE・バックアップ・原子的な書き込みまで丸ごと同梱の Python が行い、
mod はそれを `$.process.run` で起動して結果を受け取るだけにする。Python は一時ファイルを書いて `os.replace` で置き換える。
Windows では、他のプロセスがファイルを開いていると置き換えが失敗しうる（共有違反）。本体が settings.json を監視・読み込みしている最中に置き換えて、失敗が出るかを数える。

スクリプトは一時ディレクトリに隔離した `CLAUDE_CONFIG_DIR` を作り、その中の settings.json だけを書き換える（本人の `~/.claude` には触れない）。
隔離するので Bedrock の設定は無く、claude は未ログインのまま `/feas-field hold 20`（20 秒待つだけのコマンド）を実行する。

```powershell
python "$env:FEAS\tools\replace_check.py"
```

```zsh
python3 "$FEAS/tools/replace_check.py"         # macOS（このマシンでは A・B とも失敗 0）
```

**判定:**

| 欄 | 見方 |
|---|---|
| `A.whileOpenByPython` | Python が開いたままのファイルへの置き換え。`PermissionError(winerror=5 か 32 …)` なら、開いている者がいると失敗する（推測では Windows で失敗する） |
| `B.replaces` | 本体が動いている間の置き換えの結果の件数。`ok` だけなら本体は置き換えを妨げていない。`PermissionError` が混じれば再試行が要る |
| `B.debugDetectedChange` | 本体が変更を拾った回数。1 以上なら監視が効いている（連続した置き換えの間は拾わないことがある。macOS でも 1） |
| `B.debugSettingsTroubleLines` | 本体の debug に出た settings の読み込みの失敗。0 が期待 |
| `B.finalSettings` | `valid json` が期待 |

### 4c. mod から Python を起動できるか・stdin と stdout・パス

**目的:** 設定の自動適用では、mod が `$.process.run` で同梱の Python を起動し、stdin で渡して stdout で結果を受け取る。
Windows で `python`・`py -3`・`python3` のどれが起動できるか、日本語と cp932 に無い文字（`✓`・`𠮷`）が壊れずに往復するかを確かめる。

```powershell
claude -p "/feas-field py" --plugin-dir "$env:FEAS\feas-field"
```

```zsh
claude -p "/feas-field py" --plugin-dir "$FEAS/feas-field"   # macOS（このマシンでは python3・python の 3 通りとも eq=true）
```

`rows` は、起動のしかた（`python`・`py -3`・`python3`）× 受け渡しのしかた 3 通り:

| `mode`・`env` | 受け渡し |
|---|---|
| `text`・`-` | 普通の `sys.stdin.read()` と `print`（既定のエンコーディングに任せる） |
| `text`・`PYTHONUTF8` | 同じ読み書きを、環境変数 `PYTHONUTF8=1` で UTF-8 モードにして行う |
| `buffer`・`-` | バイト列を読み、UTF-8 として明示的に decode・encode する |

**判定:** `eq: true` の組み合わせは壊れずに往復した。`exitCode` が 0 でなく `stderrTail` に `UnicodeDecodeError`・`UnicodeEncodeError` が出たら、
その受け渡しは Windows の既定（cp932）で壊れる。`error: cannot start(…)` の Python は起動できない（`python3` が Microsoft Store の案内で終わる場合もここに出るか、`exitCode` が 0 以外になる）。

あわせて、項目 1 の `/feas-field info` を Windows で取った出力の次の欄を見る（追加の実行は不要）。

| 欄 | 見方 |
|---|---|
| `process.*.eq`・`eqIgnoreCase`・`COMPUTERNAME` | `hostname`・`platform.node()`・`COMPUTERNAME` が一致するか（大文字小文字の違いを含む） |
| `storeFiles` | `$.store` のファイル名。`%USERPROFILE%\.claude\plugins\store\feas-field_inline-<12 桁>.json` の形が期待（macOS では `~/.claude/plugins/store/` の下） |
| `configDir`・`pluginRoot` | パスの区切りと `~`（ホーム）の扱い |
| `env.OS`・`HOME`・`USERPROFILE` | Windows の判定（`OS=Windows_NT`）と、ホームの変数の有無 |

**貼り返す欄（4a〜4c）:**

```text
Windows の版（winver か [Environment]::OSVersion）:
Python の版（python --version / py -3 --version）:
4a run の出力（全文）:
4a run --interactive の出力（全文）:
4b の出力（全文）:
4c /feas-field py の出力（全文）:
4c Windows での /feas-field info の出力（項目 1 に貼ったなら「項目 1 と同じ」）:
セキュリティ製品の警告の有無:
```

---

## 5. 社内 Bitbucket の git 型マーケットプレイス

**目的:** 配布は git 型マーケットプレイスにする。社内 Bitbucket の認証付き https で、登録・導入・実行元（cache）・更新・自動更新が成り立つかを確かめる。
**本番のマーケットプレイスには触れない。**この項目は隔離した `CLAUDE_CONFIG_DIR` で行い、モデルは呼ばない。

### 準備: 検証用のリポジトリ（社内 Bitbucket）

検証用のリポジトリを 1 つ作る（例 `feas-mods-mkt`。作る場所と権限は社内の決まりに従う）。中身は次の形にする。

```text
.claude-plugin/marketplace.json
plugins/feas-field/            ← このディレクトリの feas-field/ をそのまま複製（.claude-plugin/types/ と tsconfig.json は除く）
```

`marketplace.json`:

```json
{
  "name": "feas-mods-mkt",
  "owner": { "name": "mods-feasibility" },
  "plugins": [{ "name": "feas-field", "source": "./plugins/feas-field", "description": "Mods 検証用" }]
}
```

認証は git の資格情報ヘルパー（Windows は Git Credential Manager、macOS はキーチェーン）に任せる。**URL にトークンを書かない。**
先に `git clone <リポジトリの https URL>` が手で通ることを確かめておく。

### 手順

macOS:

```zsh
export CLAUDE_CONFIG_DIR="$(mktemp -d)/cfg"     # 隔離。このターミナルだけに効く
MKT_URL='https://<bitbucket-host>/scm/<project>/feas-mods-mkt.git'
claude plugin marketplace add "$MKT_URL"
claude plugin install feas-field@feas-mods-mkt
claude -p "/feas-field info" | grep -E '"(version|pluginRoot|storeFiles|tier)"' -A2
command ls "$CLAUDE_CONFIG_DIR/plugins/cache/feas-mods-mkt/feas-field/"
```

Windows（未確認）:

```powershell
$env:CLAUDE_CONFIG_DIR = Join-Path $env:TEMP ("feas-cfg-" + (Get-Random))
$MKT_URL = 'https://<bitbucket-host>/scm/<project>/feas-mods-mkt.git'
claude plugin marketplace add $MKT_URL
claude plugin install feas-field@feas-mods-mkt
claude -p "/feas-field info"
Get-ChildItem "$env:CLAUDE_CONFIG_DIR\plugins\cache\feas-mods-mkt\feas-field"
```

隔離した config は未ログインなので、`-p` で普通の質問をすると `Not logged in` になる。`/feas-field` は mod のコマンドなので動く（macOS で確認済み）。

**更新:** リポジトリで `plugins/feas-field/.claude-plugin/plugin.json` の `version` を `0.1.1` に上げて push し、次を行う。

```zsh
claude plugin marketplace update feas-mods-mkt
claude plugin update feas-field@feas-mods-mkt
claude -p "/feas-field info" | grep '"pluginRoot"'     # …/feas-field/0.1.1 になるのが期待
```

**自動更新（任意。20 分ほど待つ）:** 版を `0.1.2` に上げて push し、隔離 config の `settings.json` の
`extraKnownMarketplaces.feas-mods-mkt` に `"autoUpdate": true` を足す（`marketplace add` が作ったファイル。隔離側なので書き換えてよい）。
対話の `claude` を起動して放置し、`plugins/cache/feas-mods-mkt/feas-field/` に `0.1.2` が増えるまでの時間を測る。
隔離した config の対話では初期設定の画面が出る（ターミナル設定は「No」）。ログイン方法の画面で止まるときは、
このターミナルで `CLAUDE_CODE_USE_BEDROCK=1` といつもの AWS の環境変数を設定してから起動する。

**届かないとき（任意）:** VPN を切った状態で `claude -p "/feas-field info"` を実行し、cache から動き続けるかを見る。

**判定:**

| 見えたもの | 判定 |
|---|---|
| `marketplace add` が成功 | 認証付き https・shallow clone が通る。失敗したらエラー全文（URL・ユーザー名は伏せる） |
| `pluginRoot` が `…/plugins/cache/feas-mods-mkt/feas-field/0.1.0` | 実行元は cache（macOS の検証と同じ） |
| 更新の後に `0.1.1` | 「marketplace update → plugin update → 次の起動」で届く |
| 自動更新で `0.1.2` が増えた時間 | 既定の端末（`FORCE_AUTOUPDATE_PLUGINS` 無し）で自動更新が走るか、その所要時間。`info` の env 欄の `DISABLE_AUTOUPDATER`・`FORCE_AUTOUPDATE_PLUGINS` も書く |

**貼り返す欄:**

```text
marketplace add / install の出力:
導入直後の info の version・pluginRoot・storeFiles:
cache の一覧:
更新後の pluginRoot:
自動更新: 0.1.2 が増えたか、起動から何分か:
VPN を切ったときの info の出力:
```

**片付け（この項目）:** 隔離した config の親ディレクトリを消す（`echo $CLAUDE_CONFIG_DIR` で場所を確かめ、シンボリックリンクではないことを `command ls -la` で確かめてから）。
ターミナルを閉じるか `unset CLAUDE_CONFIG_DIR`（Windows は `Remove-Item Env:CLAUDE_CONFIG_DIR`）で元に戻す。検証用のリポジトリは不要になったら削除する。

---

## 6. お知らせのバンドが新規と resume で描かれるか

**目的:** お知らせは入力欄の上のバンド（AbovePrompt）に出す。2.1.285 では resume で SessionStart の systemMessage が出なかったので、
バンドが新規のセッション・`claude --resume`・セッション中の `/resume` のどれでも描かれるかを見る。`FEAS_BAND=1` を付けて起動すると、
起動直後から `feas-field band sid=<セッション ID の先頭 8 桁> starts=<数> example.com を開く` の 1 行が出る。モデルは呼ばない。

macOS（信頼済みのフォルダで。`SID` は項目 2 のもの）:

```zsh
FEAS_BAND=1 claude --plugin-dir "$FEAS/feas-field"                       # 新規。バンドを見たら /resume で項目 2 のセッションを選び、もう一度見て /exit
FEAS_BAND=1 claude --resume "$SID" --plugin-dir "$FEAS/feas-field"       # resume。バンドを見たら /exit
```

Windows（未確認）:

```powershell
$env:FEAS_BAND = '1'
claude --plugin-dir "$env:FEAS\feas-field"
claude --resume $SID --plugin-dir "$env:FEAS\feas-field"
Remove-Item Env:FEAS_BAND
```

**判定:** 3 つの場面それぞれでバンドが出たか。`/resume` の後は `sid=` の値が選んだセッションのものに変わり、`starts` は増えない
（`session.start` は `/resume` では再発火しない。公式 docs と同じ）。このマシンでは 3 つとも出た（未ログイン、Bedrock の設定なし）。
起動から描かれるまで時間がかかることがあるので、10〜20 秒は待つ。

**貼り返す欄:**

```text
新規でバンドが出たか（sid・starts）:
/resume の後にバンドが出たか（sid・starts）:
claude --resume でバンドが出たか（sid・starts）:
```

---

## 7. 任意: Desktop・VS Code での表示

**目的:** Desktop アプリと VS Code 拡張での `surface`・`isInteractive`・`CLAUDE_CODE_ENTRYPOINT` の値、バンド・トーストの描画、
リンクを押したときにブラウザが開くか、`$.process.run` が使えるかを見る。

フラグを渡せないアプリには、環境変数 `CLAUDE_CODE_PLUGIN_DIRS`（公式 docs にある。`--plugin-dir` と同じ働き）で mod を読み込ませる。
本人の settings.json の `env` には書かず、アプリを起動する環境にだけ設定する。アプリが起動済みなら先に終了しておく。

```zsh
CLAUDE_CODE_PLUGIN_DIRS="$FEAS/feas-field" code .                              # VS Code（macOS）
open -a Claude --env CLAUDE_CODE_PLUGIN_DIRS="$FEAS/feas-field"                # Desktop（macOS。効くかは未確認）
```

```powershell
$env:CLAUDE_CODE_PLUGIN_DIRS = "$env:FEAS\feas-field"; code .                  # VS Code（Windows）
```

Desktop（Windows）は、同じ PowerShell から Claude Desktop の実行ファイルを `Start-Process` で起動する（置き場所は端末によって違う）。
読み込まれたかは `/plugin` の `mod active · feas-field` の表示で分かる（公式 docs）。

セッションの中で次を順に実行する。

1. `/feas-field info`（`sessionStart`・`surfaces`・`env.CLAUDE_CODE_ENTRYPOINT`・`process` を見る）
2. `/feas-field ui`（トースト `feas-field: toast` と、入力欄の上のバンドが出るか。バンドの「example.com を開く」を押してブラウザが開くか）
3. もう一度 `/feas-field ui`（バンドが消える）

`CLAUDE_CODE_PLUGIN_DIRS` で読み込まれなかったら、その旨を書いて終える。

**貼り返す欄:**

```text
面（Desktop / VS Code）と版:
読み込まれたか（/plugin の表示）:
info の sessionStart・surfaces・CLAUDE_CODE_ENTRYPOINT・process:
トースト・バンドが出たか（できればスクリーンショット）:
リンクを押してブラウザが開いたか:
```

---

## 片付け

- 受信器を止める（Ctrl+C。10 分で自動で止まる）
- 残ったプロセスが無いことを確かめる（何も出なければよい）

  ```zsh
  pgrep -fl 'feas-field|detach_check|recv.py|replace_check'
  ```

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'feas-field|detach_check|recv\.py|replace_check' } | Select-Object ProcessId, Name
  ```

- debug ログの置き場を消す: `rm -r "$FEAS_OUT"`（Windows は `Remove-Item -Recurse $FEAS_OUT`）
- `tools/detach_check.py`・`tools/replace_check.py` は自分の一時ディレクトリを終わりに消す（`--keep` を付けたときと、途中で止めたときは残る。
  macOS は `$TMPDIR`、Windows は `%TEMP%` の下の `feas-detach-*`・`feas-replace-*`）
- mod の `$.store` が本人の config に作ったファイルを消す: `~/.claude/plugins/store/feas-field_inline-*.json`
  （Windows は `%USERPROFILE%\.claude\plugins\store\` の下）。この名前のファイルだけを消す
- 検証のセッションの記録（`~/.claude/projects/` の下）は、普段のセッションと同じく残る

---

## 付録 A: managed settings に書き込む検証（既定では行わない）

> **管理者権限が要る。その端末の全利用者・全セッションに効く。情報システム部門の了解を得てから行う。**
> 会社が MDM で managed settings を配っている端末では、手で置いたファイルより MDM が優先され、また MDM に上書きされうる。
> 壊れた JSON を置くと Claude Code が起動しなくなる（公式 docs）。検証用の端末で行い、終わったら必ず元に戻す。

確かめたいこと（項目 1 で managed settings が無い端末を前提にする）:

1. managed の `prependPlugins` に置いた mod が `tier prepend` で読み込まれ、利用者 settings の `prependPlugins` が無視されるか
2. 利用者 tier の握り潰す mod がいても、prepend の mod が本物を受け取り、送信が届くか
3. `allowManagedModsOnly`・`allowManagedHooksOnly`・`disableSideloadFlags` の効き方
4. managed settings に書いた SessionEnd hook の `timeout` で、`session.end` の予算（既定 1.5 秒）が上がるか

置き場所（公式 docs）: macOS `/Library/Application Support/ClaudeCode/managed-settings.json`、Windows `C:\Program Files\ClaudeCode\managed-settings.json`。
中身の例と手順の材料は `../reports/g3a.md` の「会社 PC で確かめる手順の材料」にある。実施する場合は、その時点で手順を相談してほしい。
