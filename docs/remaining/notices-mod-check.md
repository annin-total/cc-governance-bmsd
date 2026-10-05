# 社内の端末でのお知らせの mod の確認

お知らせの mod を、社内リポジトリから git 型のマーケットプレイスとして導入したときに、実際に読み込まれて動くかを確かめる手順。
開発機からは社内リポジトリに到達できず、Bedrock の認証も無いため、社内の端末（macOS、zsh）で行う。上から順に行えば終わる。
mod の振る舞いそのもの（描く木・既読のキー・例外）は `tests/mod/` が見ており、ここでは繰り返さない。

**完了条件** — 項目 A〜E がすべて合格し、結果（版・観測）を利用者が開発者に返したこと。
外界の事実として新しく分かったこと（版つき）は `../knowledge/claude-code-behavior.md` に移し、この文書を消して `../README.md` の一覧からも外す。
不合格の項目があれば、直さずに「結果の返し方」の形で返す。

## 守ること

- **本人の `~/.claude` を書き換えない。**導入も起動も、準備で作る隔離ディレクトリを `CLAUDE_CONFIG_DIR` に渡して行う。
  `HOME` は差し替えない（macOS で認証が壊れる）
- **本番の配布リポジトリを使わない。**社内リポジトリに検証用のリポジトリを 1 つ用意して使う
- **送信先を本番に向けない。**検証用のリポジトリに入れる `config.json` の `ingest_url` は空にする（準備 3 で確かめる）
- **Claude Code のセッションの中（`!` や Bash）から実行しない。**Claude Code から起動されていない普通のターミナルで行う
- 隔離した config では `/login` しない。認証は環境変数で渡す（ログインすると、キーチェーンに項目が残る）
- 初回の画面でターミナル設定（Shift+Enter）を勧められたら「No」を選ぶ（「Yes」は本人のターミナルの設定を書き換える）

## 準備

1. **本体の版を確かめる。**

   ```zsh
   claude --version
   ```

   合格: 2.1.287 以上。表示された版を控える（結果に書く）

2. **このブランチの `plugin/` を検証する。**`cc-governance-bmsd` を取得したディレクトリで、確かめたいブランチ（PR のブランチ）に切り替えてから行う。

   ```zsh
   git rev-parse --short HEAD
   claude plugin validate plugin --strict
   ```

   合格: 最後に `Validation passed` が出る。コミットの短い ID を控える

3. **検証用のリポジトリに差し込む。**社内リポジトリに検証用のリポジトリを作り（作る場所と権限は社内の決まりに従う）、ssh で clone する。
   ssh のポートが 22 でなければ、`~/.ssh/config` に `Host <別名>`・`HostName`・`Port`・`User git` を書いた別名を使う。
   clone したディレクトリで、次の形にする。

   ```text
   .claude-plugin/marketplace.json
   plugins/governance/          ← cc-governance-bmsd の plugin/ の中身をそのまま
   ```

   `plugin/` の写しは次のコマンドで作る（`<cc-governance-bmsd のパス>` と `<clone したパス>` は実際のパスに置き換える）。
   本体が `--plugin-dir` の読み込みで書くファイルと `__pycache__` は写さない。

   ```zsh
   mkdir -p <clone したパス>/plugins/governance <clone したパス>/.claude-plugin
   rsync -a --delete --exclude __pycache__ --exclude tsconfig.json --exclude .claude-plugin/types <cc-governance-bmsd のパス>/plugin/ <clone したパス>/plugins/governance/
   ```

   `.claude-plugin/marketplace.json` は次の内容で作る。

   ```json
   {
     "name": "cc-marketplace-governance-bmsd",
     "owner": { "name": "BMSD" },
     "plugins": [
       { "name": "governance", "source": "./plugins/governance", "description": "お知らせの mod の確認用" }
     ]
   }
   ```

   `plugins/governance/notices.json` を、次の確認用のお知らせに置き換える（1 件目は文言つきのリンク、2 件目は既定の文言のリンク、3 件目はリンク無し）。

   ```json
   [
     { "id": "check-1", "title": "確認 1 件目", "body": "文言つきのリンクがある。\n本文の 2 行目。", "url": "https://example.com/one", "label": "手順を見る" },
     { "id": "check-2", "title": "確認 2 件目", "body": "既定の文言のリンクがある。", "url": "https://example.com/two" },
     { "id": "check-3", "title": "確認 3 件目", "body": "リンクが無い。" }
   ]
   ```

   送信先が空であることを確かめる。

   ```zsh
   python3 -c "import json; c = json.load(open('<clone したパス>/plugins/governance/config.json')); print(repr(c['ingest_url']), repr(c['ingest_token']))"
   ```

   合格: `'' ''` と出る。値が入っていれば、`config.json` の `ingest_url` と `ingest_token` を空文字にしてから進む

   コミットして push する。

   ```zsh
   git -C <clone したパス> add -A
   git -C <clone したパス> commit -m "お知らせの mod の確認"
   git -C <clone したパス> push
   ```

4. **隔離ディレクトリを作る。**

   ```zsh
   mktemp -d
   ```

   表示されたパスを、以降の `<隔離ルート>` に入れる。続けて次を実行する。

   ```zsh
   mkdir <隔離ルート>/config <隔離ルート>/project
   ```

5. **登録して導入する。**`<別名>` と `<リポジトリのパス>` は準備 3 で clone に使ったものと同じにする。

   ```zsh
   CLAUDE_CONFIG_DIR=<隔離ルート>/config claude plugin marketplace add git@<別名>:<リポジトリのパス>.git --scope user
   CLAUDE_CONFIG_DIR=<隔離ルート>/config claude plugin install governance@cc-marketplace-governance-bmsd --scope user
   CLAUDE_CONFIG_DIR=<隔離ルート>/config claude plugin list
   find <隔離ルート>/config/plugins/cache -maxdepth 3 -type d
   ```

   合格: `plugin list` に `governance` が `enabled` で現れ、`cache/cc-marketplace-governance-bmsd/governance/<版>` のディレクトリがある

6. **起動のしかたを決める。**以降の「対話の起動」と「`-p` の起動」は次の形で行う。`env -i` で親の環境変数を断ち、認証の変数だけを渡す。
   `<認証の変数>` には、いつも Bedrock で使っている変数（`CLAUDE_CODE_USE_BEDROCK=1`・`AWS_PROFILE=…`・`AWS_REGION=…`。
   プロキシの下なら `HTTPS_PROXY=…`・`NO_PROXY=…`・`NODE_EXTRA_CA_CERTS=…` も）を並べる。値は `~/.claude/settings.json` の `env` にあるものと同じにし、
   この手順書や結果には書き写さない。`--settings` は本体の自動更新を止め、対話では描画の種類も決める。
   `tui` を設定しないと本体が端末ごとに描画を選ぶので、全画面（`fullscreen`）と従来（`default`）を明示して起動する。
   `--settings` は 1 つの JSON にまとめて渡す（`tui` は画面の描画だけを決め、隔離と送信先には関わらない）。

   対話の起動（全画面）:

   ```zsh
   cd <隔離ルート>/project
   env -i HOME="$HOME" USER="$USER" TERM="$TERM" PATH="$PATH" CLAUDE_CONFIG_DIR=<隔離ルート>/config <認証の変数> claude --settings '{"env":{"DISABLE_AUTOUPDATER":"1"},"tui":"fullscreen"}'
   ```

   対話の起動（従来）:

   ```zsh
   cd <隔離ルート>/project
   env -i HOME="$HOME" USER="$USER" TERM="$TERM" PATH="$PATH" CLAUDE_CONFIG_DIR=<隔離ルート>/config <認証の変数> claude --settings '{"env":{"DISABLE_AUTOUPDATER":"1"},"tui":"default"}'
   ```

   `-p` の起動（末尾に付けるものは項目ごとに示す）:

   ```zsh
   cd <隔離ルート>/project
   env -i HOME="$HOME" USER="$USER" TERM="$TERM" PATH="$PATH" CLAUDE_CONFIG_DIR=<隔離ルート>/config <認証の変数> claude --settings '{"env":{"DISABLE_AUTOUPDATER":"1"}}' -p ok --output-format stream-json --verbose
   ```

## 確認

既読は後戻りしないので、A から順に行う。モデルを呼ぶのは A と B の 1 回ずつ（短い応答）。

### A. `-p` では表示を `ui_log` に出し、既読にしない

1. `-p` の起動を、末尾に `| grep ui_log` を付けて実行する
   合格: `"subtype":"ui_log"` で `"plugin":"governance"` の行が 3 つ出る。`text` は `題名 / 本文 / URL` の形（3 件目は URL 無し。本文の改行は空白になる）
2. 既読が付いていないことを確かめる

   ```zsh
   find <隔離ルート>/config/plugins/store -type f -name 'governance_*'
   ```

   合格: 何も出ない。ファイルが出たら `cat <出たファイル>` を実行し、`seen:` で始まるキーが無ければ合格

### B. 対話で、未読がすべてバンドに出る

1. 端末の大きさを 80 列 × 24 行にする。macOS の Terminal と iTerm2 では次で変わる（変わらなければウィンドウを手で合わせる）

   ```zsh
   printf '\e[8;24;80t'; stty size
   ```

   合格: `24 80` と出る
2. 対話の起動（全画面）を行う。初回の画面（テーマ・フォルダの信頼・ターミナル設定）は、フォルダの信頼を「はい」、ターミナル設定を「No」にして進む。
   信頼を承認するまで mod は読み込まれない
3. 入力欄の上の枠を見る（80x24 のまま）
   合格: 枠の先頭に押し方の案内が 1 行あり、その下に 1 件目の題名の行と `[ 既読にする ]` が窓の中に見える。
   残りが窓に収まらないときは、枠の下に `↓ n more` のような行が出る
4. 端末のウィンドウを手で 120 列 × 40 行ほどに広げる（セッションの中からは大きさを変えるコマンドを打たない）
   合格: 3 件が上から順に並び、それぞれ題名の行に `[ 既読にする ]` と題名（太字）、その下に本文がある。1 件目の本文は 2 行に分かれる。
   1 件目に「手順を見る」、2 件目に「詳細を開く」というリンクの文言と、その下に薄い文字の URL がある。3 件目にはリンクも URL も無い
5. 入力欄に `ok` と送る（後の `/resume` で選べるようにするため）。返答が来たら次へ進む。セッションは閉じない
6. 別のターミナルを 80 列 × 24 行にして、対話の起動（従来）を行う。枠を見るだけで、ボタンは押さない。見終わったら `/exit` で閉じる
   合格: 枠の先頭の案内と 3 件がすべて見える（従来の描画では窓が端末の高さまで使える）

### C. 既読のボタン

1. 全画面のセッションで、ctrl+x に続けて tab を押して枠に移る（1 件目のボタンが選ばれる）。tab をもう 1 回押して 2 件目の
   `[ 既読にする ]` を選び、Enter を素早く 2 回押す。上下の矢印キーは枠の中をスクロールするだけで、ボタンは選ばれない
   合格: 2 件目だけが消え、1 件目と 3 件目が残る（2 回目の Enter で 3 件目に既読が付かない）
2. Esc で入力欄に戻る。別のターミナルで次を実行する

   ```zsh
   cat <隔離ルート>/config/plugins/store/governance_cc-marketplace-governance-bmsd-*.json
   ```

   合格: `"seen:check-2": true` がある。`seen:check-1`・`seen:check-3` は無い
3. 3 件目の `[ 既読にする ]` をマウスでクリックする。効かなければ、ctrl+x tab で枠に移り、tab で 3 件目を選んで Enter を押す
   合格: 3 件目が消え、1 件目だけが残る。クリックで消えたかどうかを結果に書く
4. 英字を打っても既読にならないことを確かめる。入力欄が空の状態で `a` を打って 2 秒待つ
   合格: 1 件目は残り、入力欄に `a` が入る。Backspace で消す
5. （任意）1 件目のリンクの文言を、ターミナルのリンクを開く操作で押す。ブラウザが開いたかを結果に書く（合否には含めない）

### D. `/clear`・`/resume`・`--resume` の後

1. 入力欄で `/clear` を実行する
   合格: 枠に 1 件目だけが出る
2. `/resume` を実行し、B で `ok` を送ったセッションを選ぶ
   合格: 枠に 1 件目だけが出る
3. `/exit` で終了し、表示された `claude --resume <session_id>` の `<session_id>` を控える。
   対話の起動（全画面）の末尾に `--resume <控えた session_id>` を足して起動する
   合格: 枠に 1 件目だけが出る
4. 1 件目の `[ 既読にする ]` を押す（ctrl+x tab で移って Enter）。`/exit` で終了し、対話の起動（全画面）をもう一度行う
   合格: 枠が出ない（すべて既読）

### E. 収集と設定の自動適用が動いている

次を実行する（行頭に空白を入れずに貼る。`EOF` の行に空白があると終わらない）。

```zsh
python3 - <<'EOF'
import collections, json, pathlib
cfg = pathlib.Path("<隔離ルート>/config")
rows = []
for p in (cfg / "plugins/data").glob("governance-*/**/*"):
    if p.is_file() and (p.name == "queue.jsonl" or p.parent.name == "spool"):
        rows += [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
print(collections.Counter(r.get("kind") for r in rows))
print(sorted({r.get("hook_event") for r in rows if r.get("kind") == "event"}, key=str))
print([r.get("stage") for r in rows if r.get("kind") == "error"])
s = json.loads((cfg / "settings.json").read_text(encoding="utf-8"))
print(json.dumps(s.get("env", {}), ensure_ascii=False))
EOF
```

合格: 1 行目に `event` と `policy` が 1 以上ある。2 行目に `SessionStart`・`UserPromptSubmit`・`Stop` がある。3 行目が `[]`。
4 行目の `env` に、`cc-governance-bmsd` の `plugin/hooks/policy.py` の `SET` が配る `env.` のキーと同じ値がある
（送信先が空なので、行は送られずに残るのが正常）

## 片付け

1. 隔離ディレクトリを消す

   ```zsh
   rm -rf <隔離ルート>
   ```

2. 本人の環境が変わっていないことを確かめる

   ```zsh
   claude plugin marketplace list
   claude plugin list
   ```

   合格: 作業の前と同じ（`cc-marketplace-governance-bmsd` の検証用の登録が増えていない）
3. 検証用のリポジトリは、結果を返した後に消してよい

## 結果の返し方

次を埋めて返す。不合格の項目は、見えたものをそのまま書き、隔離ディレクトリを消さずに残す。
画面は文字で書く（スクリーンショットだけでは判定しない）。社内のホスト名・パス・ユーザー名は伏せる。

```text
本体の版 / OS:
コミットの短い ID:
準備 5（登録・導入）: 合格 / 不合格（出力）
A（-p）: 合格 / 不合格（ui_log の行の数と text、store のファイルの有無）
B（表示）: 全画面の 80x24 で案内と 1 件目のボタンが見えたか / 120x40 での並び / 従来の 80x24 で全件見えたか（崩れた点）
C（既読）: 二度押しで 3 件目に付かなかったか / store の中身 / クリックで押せたか / `a` で既読にならなかったか。任意のリンク: 開いた / 開かない / 未実施
D（/clear・/resume・--resume・すべて既読の後）: それぞれ 合格 / 不合格
E（収集と設定）: 合格 / 不合格（4 行の出力。env の値は伏せてよい）
気づいたこと:
```
