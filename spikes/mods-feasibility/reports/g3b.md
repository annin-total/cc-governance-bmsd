# g3b: git 型マーケットプレイスでの mod の実行元と更新（実機検証）

- 対象: Claude Code 2.1.288（macOS、native）。隔離 `CLAUDE_CONFIG_DIR=g3b/cfg`、未ログイン、モデル呼び出しなし
- 子の claude は `g3b/c.sh`（`-p`・plugin サブコマンド）と `g3b/tui.sh`（対話、tmux -L gov3b）で、指定の環境変数を外して起動
- git の配信: bare リポジトリ `g3b/srv/g3b-mkt.git` を、`git http-backend` を呼ぶ使い捨てサーバ `githttp.py` で `http://127.0.0.1:18820/g3b-mkt.git` に出した（smart HTTP）
- 検証用 mod `feas`: `session.start` で `/feas-where` を登録し `$.store` に起動回数と `$.plugin.root` を書く。`/feas-where` は `code=<版文字列> mark=<目印> root=<$.plugin.root> tag=<userConfig> starts=<起動回数>` を返す
- 正本: worktree `spikes/mods-feasibility/g3b/`（コミット f505e57）。ログ: `g3b/logs/NN-*.{out,err,debug.log}`

## 結論（事実）

| 項目 | 判定 |
|---|---|
| 1. 登録 | ローカルのパス（bare）・`file://` は不可。**localhost の http(s) git URL なら git 型として登録・導入できる** |
| 2. 実行元 | **cache（`plugins/cache/<mkt>/<plugin>/<版>/`）から実行**。clone 先の書き換えは効かず、cache の書き換えが効く。ディレクトリ型と逆 |
| 3. 型ファイル | clone 先にも cache にも `tsconfig.json`・`.claude-plugin/types/` は書かれない |
| 4. 更新 | 新しいコードが動くのは「`marketplace update` → `plugin update`（版が上がる）→ 次の起動」の後だけ。**版を上げずにコードだけ変えても届かない** |
| 5. autoUpdate | `extraKnownMarketplaces.<name>.autoUpdate: true` で、対話セッションの開始から約 4 分で更新がディスクに入った。動いているセッションは旧版のまま、`/reload-plugins` か次の起動で新版 |
| 6. `$.store` | `feas_g3b-git-mkt-61de11f4261b.json`（= `<plugin>_<marketplace>-sha256("feas@g3b-git-mkt") 先頭 12 桁`）。版を 0.1.0→0.4.0 と上げても同じファイル・同じ値を使い続けた |
| 7. userConfig | `pluginConfigs["feas@g3b-git-mkt"]` で読まれる（`--settings`・利用者 settings とも）。短いキー `pluginConfigs["feas"]` は読まれない |

## 根拠

### 1. 登録と導入
- `claude plugin marketplace add <bare のパス>` → `Marketplace file not found at …/bare.git/.claude-plugin/marketplace.json`（ディレクトリとして扱われる、rc=1）（01）
- `… add file://…/bare.git` → `Invalid marketplace source format. Try: owner/repo, https://..., or ./path`（rc=1）（02）
- dumb HTTP（`python -m http.server`）→ `fatal: dumb http transport does not support shallow capabilities`（本体は shallow clone する）（03）
- smart HTTP → `✔ Successfully added marketplace: g3b-git-mkt`（04）。`known_marketplaces.json` と `settings.json` に `"source": {"source": "git", "url": "http://127.0.0.1:18820/g3b-mkt.git"}`。
  `plugins/marketplaces/g3b-git-mkt/` は `.git` を持つ shallow clone（`git rev-parse --is-shallow-repository` = true、origin が上の URL）
- `claude plugin install feas@g3b-git-mkt` → `(scope: user)`。`installed_plugins.json` に `installPath: …/cache/g3b-git-mkt/feas/0.1.0`、`gitCommitSha` 付き（05）
- `-p "/feas-where"` → `code=code-v1 mark=MARK-ORIGIN root=…/cfg/plugins/cache/g3b-git-mkt/feas/0.1.0 …`。debug: `Read hooks.json for plugin feas …: …/cache/g3b-git-mkt/feas/0.1.0/hooks/hooks.json`、`hooks module feas@g3b-git-mkt loaded (worker, environment 1, tier user)`（06）

### 2. 実行元
- clone 先 `marketplaces/g3b-git-mkt/plugins/feas/hooks/register.ts` の目印を `MARK-CLONE` に書き換え → 応答は `mark=MARK-ORIGIN` のまま（07）
- cache `cache/g3b-git-mkt/feas/0.1.0/hooks/register.ts` を `MARK-CACHE` に書き換え → 応答が `mark=MARK-CACHE`（08）。どちらも直後に復元し cmp で一致を確認
- `$.plugin.root` も cache の版ディレクトリを返す
- clone 先を一時的に退避すると、cache が在っても mod は読み込まれない（`Marketplace g3b-git-mkt failed to load: cache-miss`、`/feas-where` はモデルに回り `Not logged in`、rc=1）。
  同じプロセスの中で背景の再 clone が走り（受信器のログに 19:00:30 の upload-pack）、次の起動では読み込まれた（09・10）

### 3. 型ファイル
- 導入・`-p`・更新・対話の後、`plugins/marketplaces` と `plugins/cache` の下に `tsconfig.json`・`types` は無い（find で 0 件）

### 4. 更新（版文字列 `CODE_VERSION` と plugin.json の version を元リポジトリで変えて push）
| 元の変更 | 操作 | 結果 |
|---|---|---|
| code-v2・0.2.0 | 何もしない（2 回起動） | code-v1 のまま。clone 先も旧コミット（11・12） |
| 同上 | `marketplace update` | clone 先は新コミット（`Replacing the existing marketplace clone…`、clone し直し）。実行は code-v1・cache 0.1.0 のまま、`plugin list` も 0.1.0（13・14） |
| 同上 | `plugin update` | `updated from 0.1.0 to 0.2.0 … Restart to apply changes.`。cache に 0.2.0 が増え 0.1.0 に `.orphaned_at`。次の起動で code-v2・root=…/0.2.0（15・16） |
| code-v3・版は 0.2.0 のまま | 何もしない／`marketplace update`／`plugin update` | すべて code-v2。`plugin update` は `already at the latest version (0.2.0)`（17〜21） |
| 0.3.0 に上げる | `plugin update` だけ | `already at the latest version (0.2.0)`。git の取得は 0 回（`plugin update` は marketplace を取りに行かない）（22・23） |
| 同上 | `marketplace update` → `plugin update` | 0.3.0 へ。次の起動で code-v3（24〜26） |

### 5. autoUpdate（対話、tmux）
- 設定: 隔離 `settings.json` の `extraKnownMarketplaces.g3b-git-mkt.autoUpdate: true`。起動時 debug に `Synced autoUpdate=true from settings for marketplace: g3b-git-mkt`
- 本人の本体バイナリが更新されないよう `DISABLE_AUTOUPDATER=1`、プラグインの自動更新を生かすため `FORCE_AUTOUPDATE_PLUGINS=1`、外部通信を減らすため `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` を付けた（本番の端末と条件が違う）
- 経過（UTC）: 10:11:56 起動 → 10:12:06 `/feas-where`（code-v3）と `hello` を送信（`Not logged in`）→ **10:15:56** `Marketplace checkout probe: local e46cc643bc5c remote 2a88b82c872d — re-cloning` →
  `Plugin autoupdate: updated feas@g3b-git-mkt from 0.3.0 to 0.4.0` → `Showing plugin autoupdate notification for: feas (reload required)`
- 動いているセッションで `/feas-where` → code-v3・root=…/0.3.0 のまま。`/reload-plugins`（`Reloaded: 1 plugin …`）の後は code-v4・root=…/0.4.0。mod は `environment 4` で読み込み直され、`session.start` が再発火（starts が 17→18）
- 事実として言えるのは「`DISABLE_AUTOUPDATER=1` でも `FORCE_AUTOUPDATE_PLUGINS=1` ならプラグインの自動更新が走った」こと。`FORCE_AUTOUPDATE_PLUGINS` 無しの既定の端末で同じ時間で走るかは見ていない
- 短時間で確かめる手段: 待ちは 1 回で約 4 分（起動から 4 分 0 秒、メッセージ送信から 3 分 50 秒）。遅延を縮める設定は見つけていない（バイナリの文字列を見た範囲。`-p` の実行（debug ログ 17 本）では `Plugin autoupdate` の行は一度も出ない）

### 6. `$.store`
- `cfg/plugins/store/feas_g3b-git-mkt-61de11f4261b.json` の 1 ファイルだけ。`printf 'feas@g3b-git-mkt' | shasum -a 256` の先頭 12 桁 = `61de11f4261b`
- `starts` は 0.1.0〜0.4.0 と自動更新・`/reload-plugins` を通して 1→18 と連続した（版の更新で別ファイルにならない）

### 7. userConfig
- `--settings` に `pluginConfigs.feas.options.tag=SHORT` → `tag=none`。debug: `no pluginConfigs["feas@g3b-git-mkt"].options in user, --settings or managed settings`（27）
- `pluginConfigs["feas@g3b-git-mkt"].options.tag=FULL`（`--settings`）→ `tag=FULL`（28）。利用者 settings に書くと `tag=USERSET`（29、直後に元へ戻した）

## 推測
- 本番（Bitbucket の https）でも git 型は cache から実行される。ディレクトリ型の「元を書き換えると即全員に反映」は git 型では起きず、配布は「版を上げてコミット → 端末で marketplace 更新 → plugin 更新 → 再起動か `/reload-plugins`」の経路だけになる
- 版を上げ忘れたリリースは端末に届かない（`already at the latest version`）。リリース手順で版の上げを検査する必要がある
- clone 先が消えた端末は、そのセッションだけ mod が読まれず、次の起動で直る（背景の再 clone が成功する場合）。Bitbucket に届かない状態で clone 先が消えると mod は止まり続けるはず（未検証）
- 自動更新の後、開いているセッションは旧版の cache から動き続ける。旧版ディレクトリは `.orphaned_at` が付くだけで残るので、長時間のセッションでも旧版が消えて止まることは当面ない（14 日の掃除との競合は未検証）

## 会社 PC（社内 Bitbucket）で確かめるべき残り
- Bitbucket の https URL（認証付き）での `marketplace add`・shallow clone・認証の扱い（資格情報ヘルパー・トークン）
- 既定の端末（`FORCE_AUTOUPDATE_PLUGINS` 無し、`DISABLE_AUTOUPDATER` の有無それぞれ）で `autoUpdate: true` が走るか、所要時間
- Bitbucket に届かないときの起動・自動更新の挙動（cache から動き続けるか、clone 先が消えたら）
- Bedrock 認証下（会社 PC）で同じ結果になるか。Windows での cache パス

## 未検証事項
- `-p` での自動更新（`-p` の debug には一度も出ない。待ってはいない）
- メッセージを送らない対話セッションで自動更新が走るか（今回はメッセージ送信の約 4 分後。起動からの時間なのか送信からの時間なのかは分けていない）
- `#ref` 付きの git 型、`managed settings` の `extraKnownMarketplaces`・`enabledPlugins` での導入と tier
- 旧版 cache の掃除と長時間セッションの競合

## 痕跡・後始末
- プロセス: `pgrep -fl "g3b/cfg|githttp.py|tmux -L gov3b"` 該当なし。18820 の LISTEN なし。tmux は `/exit` → kill-server、ソケット `/private/tmp/tmux-501/gov3b` を削除
- 本人の `~/.claude`: `settings.json`・`plugins/known_marketplaces.json`・`plugins/installed_plugins.json` の md5 は実施前後で一致。`plugins/cache`・`marketplaces`・`store` の一覧も一致。
  `~/.claude.json` は mtime だけ変わりサイズ同一、`g3b-git-mkt`・`scratchpad/g3b`・`feas@` の文字列なし（変化は親や並行セッションの書き込みと推測）
- 外部通信: 対話起動時に、隔離 config へ公式マーケットプレイス `claude-plugins-official` が zip で取得された（`Zip extraction completed: 538 files`、`.gcs-sha` あり）。`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` でも止まらなかった。送信ではなく取得。`-p` の実行では追加されない
- 誤操作 1 件: clone 先の退避中に本体が背景で再 clone したため、戻した `mv` が新しい clone の中に入れ子になった。入れ子の側（シンボリックリンク無しを確認）を消し、本体の再 clone を残した
- scratch に残したもの: `cfg/`（0.4.0 導入済み）、`src/`（作業リポジトリ、0.4.0）、`srv/g3b-mkt.git`、`logs/`、`work/strings.txt`（バイナリの文字列 55 MB、消してよい）
