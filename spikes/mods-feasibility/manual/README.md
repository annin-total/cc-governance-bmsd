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

**結果（2026-10-04、2.1.289、macOS 25.6.0、Bedrock。Claude Code のセッション内の Bash から、親セッションの環境変数を `env -u` で外して実行）:**

```text
Claude Code の版 / OS: 2.1.289 / macOS（Darwin 25.6.0）。手順書の 2.1.288 より新しい版（claude update と npm install -g 後も 2.1.289 が最新）
ClaudeCode ディレクトリ: /Library/Application Support/ClaudeCode/ が無い。/Library/Managed Preferences/ に anthropic を含む項目なし
/feas-field info の出力（要点。全文は検証時の出力と同じ構造）:
  settings.policyKeys=[]、policyEnvKeys=[]、policyPrependPlugins/AppendPlugins/AllowManagedModsOnly/AllowManagedHooksOnly/DisableSideloadFlags=unset、userPrependPlugins=unset
  tier=user、sessionStart={surface:null, isInteractive:false}、surfaces=[]、model=us.anthropic.claude-sonnet-5
  env: CLAUDE_CODE_ENTRYPOINT=sdk-cli、CLAUDE_CODE_USE_BEDROCK=1、NODE_EXTRA_CA_CERTS=set(len=51)、
       HTTPS_PROXY/https_proxy/HTTP_PROXY/NO_PROXY/CLAUDE_CODE_CERT_STORE/DISABLE_AUTOUPDATER/FORCE_AUTOUPDATE_PLUGINS/CLAUDE_CONFIG_DIR/AWS_REGION/OS/USERPROFILE=unset
  storeFiles=[feas-field_inline-9f5dc1bba725.json(225B)]、configDir=~/.claude
  process: hostname と python3 が eq=true、python・py -3 は cannot start（macOS に無い）
debug の grep 結果:
  cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization (none)
  hooks module feas-field@inline loaded (worker, environment 1, tier user); events: store.keys,session.start,prompt.submit,…
判定: 前回（2.1.287）と同じ。sec-default は座らず、利用者 settings の prependPlugins が効く端末
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

**結果（2026-10-04、2.1.289、macOS、Bedrock）:**

```text
FEAS_MODEL に使ったモデル: us.anthropic.claude-haiku-4-5-20251001-v1:0
1 本目の出力: 「hi」と出力されました。
/feas-field log（previousProcesses）:
  counts: classic.SessionStart 1 / session.start 1 / prompt.submit 1 / classic.UserPromptSubmit 1 / turn.start 1 / turn.step 2 /
          classic.PostToolUse 1 / tool.call 1 / classic.Stop 1 / turn.complete 1 / classic.SessionEnd 1 / session.end 1
  turns[0]: reason=answer、usage={model:"anthropic.claude-haiku-4-5-20251001-v1:0"（us. 接頭辞なし）、input_tokens 15、output_tokens 616、
            cache_read_input_tokens 27094、cache_creation_input_tokens 27775}、contextAtComplete={tokens 27780, window 200000, percent 14}
  lastStep: {model:"us.anthropic.claude-haiku-4-5-20251001-v1:0", effort:"<absent>", isSubagent:false}
  thisProcess.counts: classic.SessionStart 1 / session.start 1 / command.run 1
  usageNow: {tokens 27780, window 1000000, percent 3}（2 本目のプロセスの既定モデルの窓）
判定: すべて期待どおり。Bedrock の下で e.usage・context とも値が入る。sec-default が無いので classic.* も届いた
任意の /compact 後: counts に session.compact 1・classic.PreCompact 1 が増えた（lastStep は null＝compact 単独のプロセスでは step が無い）
任意の effort 対応モデル（sonnet → us.anthropic.claude-sonnet-5）: lastStep={model:"us.anthropic.claude-sonnet-5", effort:"medium", isSubagent:false}。
  usage.model は "claude-sonnet-5-5"（lastStep.model と表記が異なる）。input 4 / output 102 / cache_read 57028 / cache_creation 26436
  effort "medium" は利用者 settings の effortLevel 由来とみられる（未確認）
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

**結果（2026-10-04、2.1.289、macOS。3b・3c は利用者が社内の AIP 上のサーバで実施）:**

```text
3a の出力: feas-field: {"status":200,"ok":true,"bodyLen":11,"ms":1}
受信器に出た行: method=POST、path=/ingest、bodyLen=41、content-type=application/json、user-agent=Bun/1.4.3（1 行）
3a の debug の grep 結果:
  CA certs: stores=bundled,system, extraCertsPath=<社内 CA バンドルのパス>
  CA certs: Loaded 121 bundled root certificates / Loaded 9 system CA certificates / Appended extra certificates from NODE_EXTRA_CA_CERTS
  Cleared proxy agent cache（2 回）
3b（利用者が実施。受信先は社内の AIP 上のサーバ。macOS、2.1.289）: curl http_code=404、GET・POST とも
  feas-field: {"status":404,"ok":false,"bodyLen":207,"ms":99 / 95}。ネットワークとしては届いている（404 はパスの問題）。curl と mod の結果が一致
  プロキシ・社内 CA 越えの到達そのものは、この PC に HTTPS_PROXY が無いため未確認のまま
3c（利用者が実施）: 対話で /feas-field fetch GET <同じ URL> → 許可の確認画面は出ず、そのまま
  feas-field: {"status":404,"ok":false,"bodyLen":207,"ms":4824} が表示された
info の env 欄: HTTPS_PROXY・https_proxy・HTTP_PROXY・NO_PROXY・CLAUDE_CODE_CERT_STORE は unset、NODE_EXTRA_CA_CERTS は set(len=51)。
  この PC は HTTPS_PROXY なし（Bedrock はゲートウェイの URL へ直接接続）。プロキシ環境の確認にはならない
```

**追加の検証（2026-10-04、2.1.289、macOS。ローカルに立てたテスト用のプロキシ・自己署名 TLS サーバによる疑似環境。社内の実プロキシ・実 CA ではない）:**

```text
HTTP_PROXY=http://127.0.0.1:<テスト用ポート> で http://example.invalid/x へ fetch → プロキシに "GET http://example.invalid/x" が届き、mod は status 200
HTTPS_PROXY で https://example.invalid/x へ fetch → プロキシに "CONNECT example.invalid:443" が届き（プロキシが 502 を返す設定）、mod は error=ERR_PROXY_TUNNEL
  → mod の $.http.fetch は HTTP_PROXY・HTTPS_PROXY に従う（本体と同じ経路）
HTTP_PROXY 設定・NO_PROXY 未設定で http://127.0.0.1:18850 へ fetch → 127.0.0.1 宛てもプロキシに回る（GET http://127.0.0.1:18850/ingest が届いた）。
  NO_PROXY=127.0.0.1 を付けると、プロキシに届かず直接接続（受信器を止めていたので ECONNREFUSED）
  → プロキシ環境では localhost 宛てが回り込まないよう NO_PROXY に localhost・127.0.0.1 が要る
自己署名の https://127.0.0.1 へ fetch: CA 指定なし → error=DEPTH_ZERO_SELF_SIGNED_CERT／NODE_EXTRA_CA_CERTS にその証明書を指定 → status 200
  → mod の $.http.fetch は NODE_EXTRA_CA_CERTS を尊重する。OS の証明書ストア（CLAUDE_CODE_CERT_STORE）は、この PC に社内 CA を入れた環境が無く未確認
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

**結果（2026-10-04、2.1.289、macOS。Windows は未実施で保留）:**

```text
4a run: hook:popen・mod-py:popen・mod-py:nohup・mod:sh-nohup の 4 つとも started=true、survived=true（doneAfterExitSec 3.0〜3.2）。
  mod 側の起動は exitCode 0（58ms・95ms・28ms）、stderr 空。claude rc=0
4a run --interactive（利用者が実施）: /feas-field detach で mod-py:popen・mod-py:nohup・mod:sh-nohup が exitCode 0 で起動。
  hook:popen・mod-py:popen・mod-py:nohup・mod:sh-nohup の 4 つとも started=true、survived=true（doneAfterExitSec 3.0〜3.5）。claude rc=0
4b: A.whileOpenByPython=ok、afterClose=ok。B は claudeRc 0、replaces={ok:400, final:ok:1}、debugDetectedChange=1、
  debugSettingsTroubleLines=0、finalSettings=valid json。失敗 0
4c: python3 の 3 通り（text／text+PYTHONUTF8／buffer）すべて eq=true、exitCode 0、stdin・stdout とも utf-8。
  python・py -3 は macOS に無く cannot start（想定どおり）
4c の info（process 欄）: hostname と python3 が eq=true・eqIgnoreCase=true（項目 1 と同じ出力）
Windows の版・Python の版・Windows での各出力・セキュリティ製品の警告: 未実施（Windows 端末がないため保留）
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

**結果（2026-10-04、2.1.289、macOS。社内 Bitbucket は未実施。代わりにローカルの directory 型 marketplace で流れだけ確認）:**

```text
確認の方法: 一時ディレクトリに marketplace 用の git リポジトリを作り、隔離した CLAUDE_CONFIG_DIR に登録。
  `file://` 形式は "Invalid marketplace source format"（owner/repo・https://…・./path のみ）。絶対パスなら登録できた
marketplace add / install: どちらも成功（scope: user）
導入直後の pluginRoot: 元のディレクトリ（<リポジトリ>/plugins/feas-field）を指した。cache ではない。storeFiles は項目 1 と同じ形式
  → directory 型は cache から動かない。git 型は cache から動く（下の「git 型（ssh の別名 + scp 形式の URL）での自動更新」で確認）
cache の一覧: 0.1.0
更新: version を 0.1.1 にして commit → marketplace update → plugin update で "updated from 0.1.0 to 0.1.1"。cache に 0.1.0・0.1.1 が並んだ。
  更新後も pluginRoot は元のディレクトリのまま（directory 型のため）
自動更新・VPN を切った確認・Bitbucket の認証付き https: 未実施
```

**結果（利用者が実施、2026-10-04、2.1.289、macOS。社内 Bitbucket を ssh で clone し、ローカルパスで登録する方式）:**

```text
方式: `marketplace add` は ssh:// 形式を受け付けない（"Invalid marketplace source format"）。https:// 直登録は 150 秒待っても応答が無かった。
  scp 形式（git@host:path）は形式としては受理されるがポート 22 固定で届かない。そのため ssh:// で clone してローカルパスで登録した
  （ssh の別名 Host にポート 7999 を割り当てる方法でも、空リポジトリの clone までは通ることを確認した。後の git 型の確認と自動同期はこの方式で行った）
push: 空リポジトリへの最初の push が成功（main に 8 ファイル）。認証は ssh 鍵
marketplace add（ローカルパス）/ install: どちらも成功（scope: user）
導入直後の pluginRoot: ~/Documents/Dev/tmp/feas-mods-mkt/plugins/feas-field（clone 先。cache ではない）
storeFiles: feas-field_feas-mods-mkt-<12 桁>.json（--plugin-dir のときの feas-field_inline-<12 桁>.json とは名前の形が違う）
cache の一覧: 0.1.0
更新: 別の clone から 0.1.1 を push → 利用者側で git pull（fast-forward）→ marketplace update → plugin update が
  "updated from 0.1.0 to 0.1.1"。cache は 0.1.0・0.1.1。更新後も pluginRoot は clone 先のまま（Restart to apply changes）
判定: ローカルの git リポジトリでの確認と同じ。この方式では実行元は clone 先で、更新は git pull と marketplace update・plugin update で届く。
  git 型の cache 実行・VPN 切断時の挙動は、この方式では確かめていない（git 型は下の別の確認で扱った）
```

**自動更新の確認（2026-10-04、2.1.289、macOS。directory 型の marketplace で確認）:**

```text
設定: 隔離した config の settings.json に extraKnownMarketplaces.feas-mods-mkt.autoUpdate = true（source は {"source":"directory","path":…}）
手順: 導入後（0.1.1）に、元のリポジトリを 0.1.2 に進めて commit。対話の claude を起動して放置し、cache に 0.1.2 が増えるかを 30 分監視
結果: 増えなかった（起動 14:10:57 から 14:40 まで cache は 0.1.1 のまま）。debug には "Synced autoUpdate=true from settings for marketplace: feas-mods-mkt"
  が出ており、設定自体は読まれている。自動更新の実行や更新確認を示す行は無かった
判定: directory 型（ローカルパス登録）では、autoUpdate: true を付けても 30 分以内に更新されない。設定は認識される
  ただしこの PC は DISABLE_AUTOUPDATER・FORCE_AUTOUPDATE_PLUGINS とも unset、インストール種別は npm-global。
  30 分より長い間隔で動く可能性と、git 型の marketplace なら動く可能性は、この実験では否定できない（未確認）
  directory 型の更新は git pull → marketplace update → plugin update の手動で届くことを確認済み
```

**本物の ~/.claude への導入（利用者が実施、2026-10-04、2.1.289、macOS、Bedrock）:**

```text
手順: ssh:// で ~/.claude/plugins/marketplaces/feas-mods-mkt に clone → ローカルパスで marketplace add → install --scope local
  （検証用フォルダ ~/Documents/Dev/tmp/feas-trial で実施）
結果: add・install とも成功（marketplace は "declared in user settings"＝ user スコープの設定に入る。plugin の有効化だけが local スコープ）
  plugin list: Version 0.1.1、Read from: ~/.claude/plugins/marketplaces/feas-mods-mkt/plugins/feas-field、Scope: local、enabled
  -p と対話の両方で /feas-field が動き、tier=user、/plugin に "1 mod active · feas-field"、surface=terminal、isInteractive=true、
  CLAUDE_CODE_ENTRYPOINT=cli。storeFiles に feas-field_feas-mods-mkt-<12 桁>.json（727B）が増えた
別フォルダ（~/Downloads）: `/feas-field info` が未知のコマンドとして扱われ、モデルに通常の文として渡された（mod は読み込まれていない）
  → --scope local で導入した mod は、そのフォルダにだけ効く
```

**本物の ~/.claude での自動更新・手動更新（利用者が実施、2026-10-04、2.1.289、macOS。directory 型で登録した clone）:**

```text
設定: /plugin → Marketplaces → feas-mods-mkt → Enable auto-update で有効化。settings.json の extraKnownMarketplaces.feas-mods-mkt が
  {"source":{"source":"directory","path":"~/.claude/plugins/marketplaces/feas-mods-mkt"},"autoUpdate":true} になった
手順: 別の clone から 0.1.2 を Bitbucket に push（15:06:21）→ 検証用フォルダで claude を起動して放置（debug 付き。起動は push の後の 15:17 JST）
結果: 15:32（push から約 26 分）まで、手元の clone は 0.1.1 の commit（a1e0709）のまま、cache は 0.1.1 のまま、plugin list も 0.1.1。
  debug には autoUpdate の実行や更新確認を示す行が無い（AutoUpdaterWrapper の行のみ）
判定: directory 型の marketplace では、autoUpdate: true にしても Bitbucket の更新は届かない。
  Claude Code が見ているのは手元の clone で、自動で git pull はしない。起動後に更新を取りに行く動きも確認できなかった
手動更新: `git -C <clone> pull`（a1e0709..64cfdf8 の fast-forward）→ marketplace update → plugin update が
  "updated from 0.1.1 to 0.1.2 for scope local"、plugin list は 0.1.2・enabled、cache は 0.1.1・0.1.2。Restart to apply changes
  pull の前に plugin update を実行すると、"feas-field is read from its folder, …: nothing to update. Edits there take effect at the next
  session start or /reload-plugins."（directory 型は clone 内のファイルを直接読む。実行内容を変えるのは git pull で、plugin update は版の記録）
補足: 検証用フォルダ以外の場所で `claude plugin list` を実行すると、local スコープの feas-field は "Status: ✘ disabled" と表示される
  （導入した場所の外では無効扱い。別フォルダで mod が動かない検証結果と整合）
```

**git 型（ssh の別名 + scp 形式の URL）での自動更新（利用者が実施、2026-10-04、2.1.289、macOS）:**

```text
登録: ~/.ssh/config に Host bitbucket-rit（HostName git.sampleß-it.com、Port 7999、User git）を追記し、
  `claude plugin marketplace add git@bitbucket-rit:tyai/feas-mods-mkt.git` → install --scope local が成功。
  Claude 自身が clone する（"Cloning repository (timeout: 120s)"）。settings.json は {"source":{"source":"git","url":"git@bitbucket-rit:…"}}
  Version 0.1.2、pluginRoot=~/.claude/plugins/cache/feas-mods-mkt/feas-field/0.1.2（git 型は cache から実行される）
自動更新: autoUpdate=true（/plugin から有効化）。0.1.3 を push（15:49:54）→ 対話の claude を 15:50 に起動して放置
  15:56 と 16:22: cache は 0.1.2 のまま。16:22 に marketplace の clone は db9fb15（0.1.3）まで進んでいた（Claude 自身が取得）
  claude を 16:27:17 に再起動 → 16:28:44 は cache が 0.1.2 のみ、16:30:47 に 0.1.2・0.1.3 の 2 つ（起動の約 3 分後に 0.1.3 が自動で cache に入った）
  ただし plugin list の Version と claude -p の pluginRoot は 0.1.2 のまま。再起動（16:31・16:37）や -p の実行を繰り返しても 16:44 まで 0.1.2
  /plugin の操作と /reload-plugins の実行後（16:45）に、plugin list=0.1.3、pluginRoot=…/0.1.3 に切り替わった
  （16:4x の /plugin で "✔ Removed 1 marketplace" と出ていたのは、この検証と無関係のマーケットプレイス（diagram-design）の削除。feas-mods-mkt は残っていた。
   切り替えの前に実行した操作は、その削除と /reload-plugins の 2 つで、/reload-plugins が原因とみられる（削除との切り分けはしていない））
判定: git 型なら autoUpdate で「marketplace の取得」と「cache への新しい版の配置」は自動で起きる（起動後 数分〜30 分）。
  しかし実行される版への切り替え（インストール記録の更新）は、再起動だけでは起きず、/reload-plugins など明示の操作が要った
  → 利用者に何もさせずに新しい版を効かせるには、更新後に /reload-plugins 相当を自動で行う仕組みが要る
```

**mod による自動同期（隔離環境で確認、2026-10-04、2.1.289、macOS。ローカルの HTTP 上の git 型 marketplace、隔離した CLAUDE_CONFIG_DIR）:**

```text
再現用の環境: 社内の Bitbucket に触れずに git 型を試すため、ローカルで `git http-backend` を Python の CGI（http.server）で配り、
  `claude plugin marketplace add http://127.0.0.1:<port>/cgi-bin/git/<repo>.git` で登録した。marketplace add が受け付ける git の URL は
  owner/repo・https://…・http://…・scp 形式（git@host:path）で、file://・git://・ssh:// は "Invalid marketplace source format"。
  通常の（ダムな）静的 HTTP は、Claude が shallow clone をするため "dumb http transport does not support shallow capabilities" で失敗する。
  Bitbucket のようにポートが 22 以外の ssh は、ssh の設定で別名（Port 付き）を作り、scp 形式で登録する
検証用コマンド（feas-field に追加）: /feas-field update <plugin>@<marketplace>、/feas-field reload、
  環境変数 FEAS_AUTOSYNC=<plugin>@<marketplace>（session.start で自動同期）、FEAS_AUTORELOAD=1（session.start で reload のみ）
mod から CLI: $.process.run(['claude','plugin','marketplace','update',…]) と ['claude','plugin','update',…] が動く（0.7 秒・0.2 秒）。
  実行後の次の起動では pluginRoot が新しい版になる（-p でも対話でも）。plugin update の表示は "Restart to apply changes."
reload-plugins: $.command.run({command:'reload-plugins'}) は、command.run の hook の中からは拒否される
  （"command.run: called from a command.run hook, it would wait on the turn this hook is holding; … run it from a later event (turn.complete)"）。
  session.start から await せずに呼べば成功（136ms、"Reloaded: …"）
端から端まで: 0.1.3（自動同期入り）を導入 → 0.1.4 を公開 → FEAS_AUTOSYNC 付きで対話を起動 → 起動から約 1 秒で、起動中のセッションが 0.1.4 に切り替わった
  （debug: process.run claude ×2 → "$.command.run (feas-field): 15 chars queued" → "refreshActivePlugins: clearing all plugin caches" →
   "Using manifest version … 0.1.4" → 新しい版の mod が再読み込み）。0.1.5→0.1.6 でも再現
注意: 再読み込みで mod のモジュールが作り直され、session.start が新しい版で再発火する（自動同期がもう一度走り、"already at the latest version" で終わる）。
  モジュール内の変数は引き継がれない（reloadNote が null になるのはこのため。実行の証拠は debug の行）
未確認: 社内 Bitbucket（ssh）での所要時間と成立、Windows（claude の実行ファイル名・PATH）、同期を間引く仕組み（$.store に時刻を持つ案）、
  Claude 本体の autoUpdate との同時実行での競合
```

**mod による自動同期を社内 Bitbucket（ssh の別名、git 型）で確認（利用者が実施、2026-10-04、2.1.289、macOS、autoUpdate: true のまま）:**

```text
手順: 0.1.4（自動同期入り）を push → 手動で 0.1.4 に更新 → 0.1.5 を push（17:13:42）→ FEAS_AUTOSYNC=feas-field@feas-mods-mkt で対話を起動（17:13:57）
結果: 成功。起動は 0.1.4 のコードで、約 2 秒後に起動中のセッションが 0.1.5 に切り替わった（再起動なし）。debug の時系列（UTC）:
  08:13:57.998 process.run claude（marketplace update）→ 59.697 終了 1701ms（ssh の取得を含む）
  08:13:59.699 process.run claude（plugin update）→ 59.948 終了 250ms
  08:13:59.948 "$.command.run (feas-field): 15 chars queued"（reload-plugins）
  08:13:59.973 refreshActivePlugins: clearing all plugin caches → "Using manifest version for feas-field@feas-mods-mkt: 0.1.5"
  08:14:00.049 以降: 再読み込み後の mod が自動同期をもう一度実行（689ms・265ms）。"already at the latest version (0.1.5)" で終了
対話の画面には "❯ /reload-plugins" と "Reloaded: 10 plugins · 30 skills · 11 agents · 13 hooks …" が出た（mod が実行した reload が、利用者の入力と同じ形で記録に残る）
/feas-field info: pluginRoot=~/.claude/plugins/cache/feas-mods-mkt/feas-field/0.1.5。plugin list=0.1.5、cache=0.1.2〜0.1.5
対象の指定: `claude plugin marketplace update <名前>`（名前を省くと全 marketplace）と `claude plugin update <plugin>@<marketplace>`（1 つのプラグイン）を
  mod が引数で指定して実行した。他の marketplace・プラグインには触れない。--scope は既定で自動判定（local スコープは起動したフォルダで決まる）。
  --json で機械可読の結果が得られる（本番では更新有無の判定に正規表現ではなく --json を使う方が確実）
備考: 利用者側の push で .DS_Store が検証用リポジトリに入った（git add -A のため。配布物には .gitignore が要る）
片付け（利用者が実施）: uninstall・marketplace remove は成功。settings.json に feas-mods-mkt は残っていない。
  残り: ~/.claude/plugins/store/ の feas-field_*.json の 2 ファイル
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

**結果（2026-10-04、2.1.289、macOS、Bedrock。tmux 上の対話で確認）:**

```text
新規でバンドが出たか: 出た（sid=6a0cb34e starts=1）。起動 20 秒後に描画済み
/resume の後にバンドが出たか: 出た（sid=41dfb8b4 starts=1）。sid が選んだセッションに変わり、starts は増えなかった。
  項目 2 の -p のセッションは /resume の一覧に出ないため、別の既存セッションを選んだ
claude --resume でバンドが出たか: 出た（sid=d96ce95b＝項目 2 のセッション、starts=1）
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

**結果（VS Code 拡張のパネル、利用者が実施、2026-10-04、CLI 2.1.289、macOS、Bedrock。拡張の版は未記入）:**

```text
読み込み: CLAUDE_CODE_PLUGIN_DIRS=<feas-field のパス> code . で mod が読み込まれ、/feas-field info が動いた（tier=user）
/plugin の表示: ターミナルの "mod active · feas-field" という表記は出なかった。一覧の中に "feas-field@inline" があった（読み込まれていることの確認はこちらで足りる）
info: sessionStart={surface:null, isInteractive:false}、surfaces=[]、env.CLAUDE_CODE_ENTRYPOINT=claude-vscode
  （ターミナルは surface="terminal"、isInteractive=true、surfaces=["terminal"]）
  process: hostname・python3 は動く（eq=true）。python・py -3 は macOS に無く cannot start。usage.context に tokens・percent が入る
/feas-field ui: 応答は "band=on" → "band=off" と切り替わったが、トースト（feas-field: toast）も入力欄の上のバンドも表示されなかった
リンク: バンドが出ないため未確認
判定（推測を含む）: VS Code 拡張のパネルでは、mod の UI の表示先（surface）が無い。surfaces=[] と isInteractive=false がその表れとみられる。
  ui.toast・ui.render（AbovePrompt）は、呼んでもエラーにならず、何も表示されない。
  command.run の戻り値のテキスト、$.process.run、$.store、$.http.fetch 系は使える見込み（$.process.run・$.store は今回動いた）
  → 拡張のパネルでも通知したいなら、ui.* に頼らない手段（コマンドの応答テキスト、session.start の systemMessage など）が別に要る
Desktop: アプリが /Applications に無く、未実施
```

**実施環境の確認（2026-10-04、macOS）:** VS Code 1.135.0（`code` コマンドあり）。Claude Code 拡張は `~/.vscode/extensions/` に 2.1.281〜2.1.287 が残っており、
有効な版は未確認（CLI の 2.1.289 と違う可能性がある）。Claude Desktop アプリは `/Applications` に見つからない。
VS Code が起動済みだと `code .` が既存のプロセスに処理を渡すだけで `CLAUDE_CODE_PLUGIN_DIRS` が効かないため、先に Cmd+Q で完全に終了する。

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
- mod の `$.store` が本人の config に作ったファイルを消す: `~/.claude/plugins/store/feas-field_*.json`
  （`--plugin-dir` では `feas-field_inline-<12 桁>.json`、marketplace から導入すると `feas-field_<marketplace>-<12 桁>.json`）
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

---

## 付録 B: 社内 Git の marketplace を ssh で clone して使う手順（導入・更新・削除）

過去に別の社内 marketplace（`ai-nization-claude-plugins`）で検証済みの手順を、この検証用リポジトリ `feas-mods-mkt` の名前に置き換えて記す。
配布方式の候補の手順書として使う。項目 5 では、この手順のうち導入・更新を `feas-mods-mkt` で確かめた（削除は項目 5 の片付けで、uninstall・marketplace remove とも成功した）。

### 方針

`claude plugin marketplace add` は `ssh://` の URL を受け付けない（受け付けるのは `owner/repo`・`https://…`・`http://…`・`scp` 形式（`git@host:path`）・ローカルパス）。
`scp` 形式はポートを書けず 22 番に繋ぐので、ポートの違う社内 Git には、この付録では ssh で clone してローカルパスで登録する（directory 型）。
この方式では autoUpdate で更新は届かず、下の手動の手順で更新する。ssh の別名に Port を付けて `scp` 形式で登録する git 型の方式は、項目 5 の「git 型（ssh の別名 + scp 形式の URL）での自動更新」にある。

ホスト名などは次のとおり読み替える。

| 表記 | 意味 | 項目 5 で使った値 |
|---|---|---|
| `<社内 Git のホスト>` | 社内 Git（Bitbucket）のホスト名 | 社内 Bitbucket |
| `<ssh ポート>` | ssh のポート | `7999` |
| `<プロジェクト>` | リポジトリを置くプロジェクトのキー | - |

### 導入（初回のみ）

```bash
git clone ssh://git@<社内 Git のホスト>:<ssh ポート>/<プロジェクト>/feas-mods-mkt.git ~/.claude/plugins/marketplaces/feas-mods-mkt
claude plugin marketplace add ~/.claude/plugins/marketplaces/feas-mods-mkt
```

clone 先は、Claude Code 標準の marketplace の保存先（`~/.claude/plugins/marketplaces/`）に揃えると分かりやすい。
項目 5 の最初の確認では、別のディレクトリ（`~/Documents/Dev/tmp/feas-mods-mkt`）に clone し、隔離した `CLAUDE_CONFIG_DIR` に登録した。その後の確認（「本物の ~/.claude への導入」以降）は本人の `~/.claude` で行った。

プラグインごとの導入:

```bash
claude plugin install feas-field@feas-mods-mkt
```

### 更新

ローカルの clone を `git pull` してから、Claude Code に再読み込みさせる。

```bash
git -C ~/.claude/plugins/marketplaces/feas-mods-mkt pull
claude plugin marketplace update feas-mods-mkt
claude plugin update feas-field@feas-mods-mkt   # 反映は次の起動から（"Restart to apply changes"）
```

項目 5 で確認した結果: 別の clone から `version` を上げて push し、利用者側で `git pull`（fast-forward）→ `marketplace update` → `plugin update` で
「updated from 0.1.0 to 0.1.1」となり、cache に両方の版が並んだ。実行元は clone 先のまま（cache ではない）。

### 削除

プラグインを 1 つだけ削除する:

```bash
claude plugin uninstall feas-field@feas-mods-mkt
```

marketplace ごと削除する（配下の全プラグインが使えなくなる）:

```bash
claude plugin marketplace remove feas-mods-mkt
```
