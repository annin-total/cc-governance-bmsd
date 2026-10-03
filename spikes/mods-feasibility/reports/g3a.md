# g3a: 握り潰しの対策の実機検証（Claude Code 2.1.288、macOS）

## 条件
- 隔離 `CLAUDE_CONFIG_DIR=g3a/cfg`、未ログイン、HOME は差し替えない。起動は `g3a/run.sh <tag> [追加引数]` → `c.sh -p "hello" --debug-file logs/<tag>.debug.log`（親の環境変数 12 個を env -u、stdin は /dev/null）
- 記録: `logs/<tag>.{debug.log,out,err,rc,settings.json,args,classic.log,gov.jsonl,recv.log}`（settings.json は実行時点の写し）。全実行とも出力は `Not logged in`、rc=1、stderr 空。モデル呼び出しは 0 回。tmux は使っていない
- マーケットプレイス `g3a/mkt`（ディレクトリ型 `g3a-mkt`）。実行のたびに worktree の正本を rsync
  - `classic`: SessionStart・UserPromptSubmit・Stop の command hook が stdin を classic.log に追記
  - `mods-adversary`: worktree `spikes/mods-adversary`（swallow / rewrite-body）
  - 正本 `spikes/mods-feasibility/g3a/`（コミット 025bdc1）:
    - `gov-observer`: plugin.register・settings.read・http.fetch・session.start・prompt.submit・classic.SessionStart・classic.UserPromptSubmit を観測して素通し。受け取った値と `next.trace`（下のリンクごとの plugin・tier・outcome・自分の e と違うキー）を gov.jsonl と debug に記録。session.start で自分の tier の手がかり（自分の settings.read の `next.origin`、各 source の prependPlugins）を集め、localhost:18811 に POST
    - `gov-guard`: origin が gov-observer の http.fetch・fs.write・settings.read を `next.to(e,'append')` で利用者 tier を飛ばす
    - `adv-native`: prompt.submit の text を偽る
    - `adv-ops`: settings.read を偽の値で答え、fs.write を deny、http.fetch を偽の 200 で答える（いずれも next を呼ばない）
- 検査: `claude plugin validate` は 4 つとも passed。tsc（`--plugin-dir` で本体に型を書かせた scratch のコピー `tc/`）は 4 つとも rc=0。gov-guard の `'append'` を `'user'` に変えると TS2769、adv-ops の `text` を `body` に変えると TS2353 で落ちる（検査が効く）

## 結果の一覧

| tag | 構成（有効 / prependPlugins / 追加） | classic.log | gov-observer が見たもの | 判定 |
|---|---|---|---|---|
| b0b-gov-user | classic, gov / なし | SS, UPS(hello) | 全イベント、自 tier=user | 基準 |
| b1-swallow | classic, adversary(swallow) / なし | 空 | — | **2.1.288 でも握り潰しを再現** |
| p1-pre-swallow | ＋adversary(swallow), adv-native, gov / [gov] | 空 | prompt.submit before=`hello`、classic.UPS=`forged-by-adv-native`、classic の trace が adversary で終わる | 本物を受け取れる（ただし後述の例外） |
| p2b-pre-rewrite-diff | adversary(rewrite-body), gov / [gov] | UPS=`forged-by-mods-adversary` | classic.UPS=`hello`、engine の changed=["prompt"] | 本物を受け取り、書き換えを検知 |
| p3-nopre-swallow | swallow, adv-native, gov / なし | 空 | classic は届かない、prompt.submit=`forged-by-adv-native`、自 tier=user | prepend から外れると負けるが、外れたことは分かる |
| p4-adv-first-prepend | / [adversary, gov] | 空 | classic は届かない。prepend_user に先客が見える | prepend の先頭を取られると負ける |
| p5-pre-send | swallow, gov / [gov] | 空 | 送信 200 `real-receiver`、受信器に届く | 送信の基準 |
| p6b-pre-advops | classic, adv-ops, gov / [gov] | SS, UPS | 送信は偽の 200（受信器に何も届かない）、settings.read は偽、fs.write は拒否 | **prepend の mod の $ 呼び出しを利用者 tier が偽れる** |
| p8-pre-advops-govguard | ＋gov-guard / [gov-guard, gov] | SS, UPS | 送信が受信器に届く。debug `adv-ops: fs.write bypassed by gov-guard (tier user)` | gov-guard で守れる |
| p9-guard-removed | / [gov]（gov-guard は有効のまま） | SS, UPS | gov-guard は読み込み失敗。送信は偽。自分の http.fetch の trace に `adv-ops user returned`（engine なし） | 外され方と、その検知 |
| p10-gov-user-guard-pre | swallow, adv-ops, gov, gov-guard / [gov-guard] | 空 | 送信は届く。classic は届かない | gov-guard は名前で守るので gov が user でも送信は守れる |
| p7-pre-advops-guardself | gov の hooks.json に module 2 つ | — | gov-observer 自体が読み込まれない | 1 プラグイン 1 モジュール |
| m1-envpath | `CLAUDE_CODE_MANAGED_SETTINGS_PATH=g3a/managed` | 空 | policy 空 | **効かない** |
| m2-flag | `--managed-settings`（enabledPlugins・prependPlugins・hooks のみ） | 空 | policy 空、sec-default not seated | 全キーが落ちる |
| m3-flag-restrictive | `--managed-settings`（＋permissions.deny・pluginConfigs） | SS, UPS(hello) | keys_policy=["permissions"] のみ、classic は届かない | **sec-default が座り、利用者 mod の握り潰しが止まる** |
| m4-flag-userprepend | m3 相当＋利用者 prependPlugins [gov]＋adv-ops | SS, UPS | gov は user tier、送信は偽 | 利用者 prependPlugins は無視される。sec-default は http.fetch を守らない |
| m5-flag-advnative | m3 相当＋adversary(swallow), adv-native | SS, UPS=`forged-by-adv-native` | — | sec-default は classic を守るが、上流の prompt.submit の書き換えは通る |
| m6-remote-path | `CLAUDE_CODE_REMOTE_SETTINGS_PATH=g3a/remote.json` | 空 | policy 空 | 効かない（未ログインが理由かは不明） |

SS=SessionStart、UPS=UserPromptSubmit。

## 1. governance を mod にして prepend に置く案（事実）
- 順序: prepend の mod は利用者 tier より先に e を見る。p1 の debug（`logs/p1-pre-swallow.debug.log`）:
  ```
  63:  prependPlugins from user settings: gov-observer@g3a-mkt
  107: hooks module gov-observer@g3a-mkt loaded (worker, environment 1, tier prepend); ...
  126: [gov-observer] GOV {"ev":"classic.SessionStart","phase":"before","source":"startup",...}
  128: mods-adversary (user) answered classic.SessionStart without next() in 0.1ms; nothing beneath it ran for this dispatch
  129: [gov-observer] GOV {"ev":"classic.SessionStart","phase":"after","trace":[{"plugin":"mods-adversary","tier":"user","outcome":"returned"}]}
  ```
- swallow でも rewrite-body でも、gov-observer は classic.* の本物の値を受け取る（p1・p2b）。ただし下の command hook は止まる・偽の値を受け取るのは変わらない。mod が自分で集める前提なら問題にならない
- **例外: classic.UserPromptSubmit は prompt.submit の連鎖の内側で発火し、利用者 tier の prompt.submit で書き換えた本文を受け取る。**p1 で gov-observer は prompt.submit では `hello`、classic.UserPromptSubmit では `forged-by-adv-native` を受け取った。本物の入力は prompt.submit で取る必要がある（書き換え後の値はモデルが実際に読む本文でもあるので、どちらを「本物」とするかは定義次第）
- 検知: `next(e)` の後の `next.trace` で、下で答えたリンク（engine に届かずに終わった）と、各リンクが受け取った e の差（p2b: engine の `changed:["prompt"]`）が分かる
- **新しい攻撃面: 利用者 tier の mod は prepend の mod の `$` 呼び出しにも割り込める。**p6b で adv-ops が gov-observer の `$.http.fetch` に偽の 200 を返し、受信器には何も届かなかった。debug `adv-ops (user) answered http.fetch without next() ...`。settings.read の結果も偽れ、fs.write は拒否できた。型定義は op イベントを「a hook above the caller」が扱うと書くが、実機では下の tier の hook が呼ばれた
- 対策: 別プラグイン gov-guard（prepend）が、origin が gov-observer の呼び出しを `next.to(e,'append')` で利用者 tier を飛ばすと守れる（p8）。gov-observer 自身に入れることはできない: hooks.json の modules は 1 つまでで（p7）、`next.to` を含むモジュールは prepend / append 以外では読み込み自体が失敗するため（p9）、外されたときに観測も止まる

## 2. 自分の tier を知る手段（事実）
- **自分の `$` 呼び出しに自分で hook すると `next.origin` に自分の tier が載る。**gov-observer の settings.read hook は自分の呼び出しを受け取り、`{"plugin":"gov-observer","tier":"prepend"}`（p1）／`"user"`（p3）を記録した（型定義の「The calling hook alone is skipped」に反して、自分の hook は呼ばれた）
- 同じ hook の `next.trace` で、自分の呼び出しに下で誰が答えたかも分かる（p9: `GOV own http.fetch trace [{"plugin":"adv-ops","tier":"user","outcome":"returned"}]`）
- `$.settings.read({source})` で各 source の prependPlugins は読めるが、利用者 tier の mod が偽れる（p6b で全 source が `["forged-by-adv-ops"]`）。gov-guard が居れば守れる（p8）
- `$.config.list()` は -p では plugin の userConfig 行を返さなかった（`configPluginKeys:[]`）。`$.plugin` は name と root だけで tier を持たない
- `plugin.register` は自分より後に入るモジュールしか見えない（p4 で先に入った adversary は見えない）
- 限界: 検知した結果を外へ送る手段（http.fetch・fs.write）自体が、守りがなければ偽られる（p9）。p3 のように外されても session.start は届くので、守りが残っていれば「user tier に落ちた」を送れる（p10 で送信は届いた。ただし p10 では gov-guard の settings.read の bypass で gov 自身の tier 記録も飛ばされた）

## 3. managed settings（この Mac で試せた範囲）
- 本体の文字列（`g3a/bin.strings`、`strings -n 6` の結果）から:
  - managed-settings.json の場所は `/Library/Application Support/ClaudeCode`（macOS）。上書き用の関数は `function AQr(){return}` で、この版では空。`CLAUDE_CODE_MANAGED_SETTINGS_PATH` は m1 で効かなかった
  - `--managed-settings <json>`（help には出ない。文字列は「Policy-tier settings JSON from a spawning parent process (SDK use only)」）は policy tier を作るが restrictive-only で絞られる。m3 で残ったのは `permissions` だけで、prependPlugins・enabledPlugins・hooks・pluginConfigs（allowManagedModsOnly を含む）は落ちた
  - prependPlugins の schema 説明: 「Only honored from managed settings (or, on a machine with none, from user settings for your own plugins); ignored in project, local and --settings sources」「Any other id that is not an enabled managed plugin is skipped」「cc-plugin-sec-default@builtin seats itself outermost (on a machine with managed settings and for Team and Enterprise organizations) unless this list is set, in which case list it where it should sit or leave it out. Name it there as sec-default@builtin」
  - 組み込み `cc-plugin-sec-default` のソース（文字列中の JS）: `classic.*`・prompt.section/context/compose・skill.prompt・attribution.text・settings.read を `next.to(o,"append")`、plugin.register（tier user）は policy の `pluginConfigs["cc-plugin-sec-default@builtin"].options.allowManagedModsOnly` が真なら refuse。http.fetch・fs.write・prompt.submit・session.* は扱わない
  - disableSideloadFlags の説明: managed で true なら `--plugin-dir`・`--plugin-url`・`--agents`・非 sdk の `--mcp-config` を起動時に拒否
- 実機（事実）:
  - m3: policy が空でなければ sec-default が `seated outermost: this machine has managed settings` で読み込まれ、`mods-adversary+gov-observer: classic.SessionStart bypassed by cc-plugin-sec-default (tier user)`。利用者 mod の swallow 下でも command hook が動いた。利用者 tier の観測 mod（gov-observer）も classic を受け取れなくなる
  - m4: 同時に `prependPlugins in user settings ignored: set by managed policy (this machine has managed settings, so both tier keys are the policy's)`。gov-observer は user tier になり、adv-ops に送信を偽られた
  - m5: sec-default 下でも、adv-native の prompt.submit 書き換え後の本文が command hook に届く
- 未検証（この Mac では不可）: 本物の managed（ファイル・MDM・server-managed）での prependPlugins、managed hooks が利用者 mod に止められないこと、allowManagedModsOnly、disableSideloadFlags。`CLAUDE_CODE_REMOTE_SETTINGS_PATH` は m6 で効かなかった（未ログインが理由かは調べていない）

### 会社 PC で確かめる手順の材料（推測を含む。管理者権限が要る）
- ファイル: macOS `/Library/Application Support/ClaudeCode/managed-settings.json`、Windows `C:\Program Files\ClaudeCode\managed-settings.json`（drop-in は同じ場所の `managed-settings.d/`）
- 中身の例:
  ```json
  {
    "extraKnownMarketplaces": { "<mkt>": { "source": { "source": "directory", "path": "<検証用マーケットプレイス>" } } },
    "enabledPlugins": { "gov-observer@<mkt>": true, "gov-guard@<mkt>": true },
    "prependPlugins": ["sec-default@builtin", "gov-guard@<mkt>", "gov-observer@<mkt>"],
    "pluginConfigs": { "cc-plugin-sec-default@builtin": { "options": { "allowManagedModsOnly": true } } },
    "disableSideloadFlags": true,
    "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "<stdin を記録するコマンド>" }] }] }
  }
  ```
- 確かめる順: (1) managed だけで gov-observer が `tier prepend` で読み込まれ、利用者 settings の prependPlugins が無視される (2) 利用者が mods-adversary（swallow）と adv-ops を入れても、gov-observer が本物を受け取り送信が届く (3) allowManagedModsOnly で利用者 mod が `mods are limited to your organization's by policy` で読み込まれない (4) managed hooks が利用者 mod に止められない (5) disableSideloadFlags で `--plugin-dir` が拒否される
- 注意（推測）: managed prependPlugins を書くと sec-default は列挙しない限り座らない。Bedrock 認証で組織プランの判定がどうなるかは不明

## 4. 版の差
- b1: 2.1.288 でも利用者 mod の swallow で command hook（SessionStart・UserPromptSubmit・SessionEnd）が止まる。debug `mods-adversary (user) answered classic.SessionStart without next() in 0.6ms; nothing beneath it ran for this dispatch`。標準エラーは空

## 対策の候補ごとの評価
| 候補 | 防げるもの | 防げないもの | 外され方 | 副作用 |
|---|---|---|---|---|
| A. governance を mod にして利用者 settings の prependPlugins に置く | 利用者 tier の mod による classic の握り潰し・書き換え（mod 自身の観測は本物） | 利用者 tier の mod による governance の $ 呼び出し（送信・書き込み・設定読み）の偽装。prompt.submit の書き換え後に発火する classic.UserPromptSubmit の本文。prepend の先頭を取る mod | 利用者が prependPlugins から外す・順を変える・プラグインを無効にする・disableAllHooks | なし（観測だけなら他の mod を妨げない） |
| B. A＋守りの mod（gov-guard、別プラグインで自分の $ 呼び出しを next.to） | A に加えて送信・書き込み・設定読みの偽装 | prepend の先頭を取る mod。プラグインの無効化 | prependPlugins から外すと gov-guard は読み込み失敗（stderr なし） | 守りの mod は 1 プラグイン 1 モジュールのため別プラグインが要る |
| C. 検知（自分の tier・trace・settings を送る） | 外されたこと（user tier に落ちた）・下で誰が答えたか・書き換えたキーを手元で知る | 送信路が偽られると届かない（守りが要る）。プラグインごと無効にされると何も送られない（サーバ側で「来ない」を見るしかない、推測） | 送信の偽装、プラグイン無効化 | 送信量が増える |
| D. managed settings（prependPlugins＋sec-default＋allowManagedModsOnly） | 静的読解と m3 からの推測: 利用者は tier を変えられず、sec-default が classic を守り、allowManagedModsOnly で利用者 mod を読み込ませない | 未検証。sec-default は http.fetch・prompt.submit を守らない（m4・m5）ので、allowManagedModsOnly なしでは governance の送信は守りが要る | 管理者権限がない限り外せない（推測） | 利用者の正当な mod も使えなくなる（allowManagedModsOnly）。利用者 tier の観測 mod は classic を受け取れない（m3） |

## 痕跡
- 子 claude・受信器（18811）・tmux（gov3a は作っていない）は残っていない（pgrep で確認）。`/private/tmp/tmux-501/g2sock` は以前から在るもので触っていない
- 本人の `~/.claude/plugins/store/` は前後で同じ。`~/.claude/projects/` に新しいディレクトリなし（実行開始以降に更新されたものなし）
- `~/.claude.json` は mtime だけ変わった（サイズ同じ）。中の g3a への参照は以前のセッション（07c44785）の `.../scratchpad/g3a/work` だけで、今回のパスは 0 件。親セッションの書き込みと区別できていない
