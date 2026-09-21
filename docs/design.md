# cc-governance-bmsd 設計書

## 1. 目的と範囲

### 1.1 目的

社内で利用する Claude Code に対して、次の 2 つを同時に成立させる。

1. **ガバナンスの適用** — 決めた設定値を全端末に確実に行き渡らせ、お知らせを届け、配布物（スキル・コマンド）を配る
2. **効果の測定** — 適用した施策が、実際にコストと利用行動を変えたかを数字で示す

この 2 つを 1 つのシステムとして設計する。適用と測定を別々の仕組みにすると、「いつ誰に適用されたか」と「そのときコストがどう動いたか」を突き合わせる作業が、システムをまたいだ手作業になるためである。

### 1.2 対象規模と制約

| 項目 | 値 |
| --- | --- |
| 利用者数 | 約 140 名 |
| サーバの Python | 3.9 固定 |
| サーバの待受ポート | 5000 固定 |
| サーバの公開形態 | サブパス配下（`https://<host>/<base-path>/...`） |
| 永続領域 | `/mnt/data`（コンテナ再起動をまたいで残る） |
| 資源 | 拡張可能。初期は 1cpu × 4GiB |
| 想定データ量 | イベント 日次 3〜5 万行 / 年間 約 1,500 万行 |

### 1.3 範囲に含めないこと

- 会話本文・プロンプト本文の保持・送信・記録。hook の入力からは**キー名を名指しで指定したものだけ**を読む
- 端末利用者の個別監視。目的は施策の評価であり、個人の行動追跡ではない
- リアルタイム性。端末からサーバへの反映は分単位、コストは日次

### 1.4 設計原則

- SRP・DRY・YAGNI・KISS を守る。**「将来必要になるかもしれない」という理由で何かを足さない**
- コードファイルは **200 行以内**を目安とする
- 端末とサーバで共有する契約は**正本 1 ファイル**に置き、DDL・INSERT・抽出処理をすべてそこから導出する
- 集計は SQL の `GROUP BY` に寄せる。アプリケーション側で全行を走査しない
- 端末側の処理は **Claude Code の応答を 1 ミリ秒もブロックしない**

---

## 2. 全体構成

### 2.1 構成要素と責務

| # | 要素 | 実体 | 責務 |
| --- | --- | --- | --- |
| 1 | 端末プラグイン | Claude Code プラグイン（git で配布） | 設定の自動適用 / お知らせ表示 / hook によるイベント収集・送信 / スキル・コマンドの配布 |
| 2 | 収集サーバ | uvicorn で動く 1 プロセス | 受信・保存・集計・管理画面・CSV 取込 |
| 3 | AI Gateway 日次 CSV | ファイル | コストとトークンの正本。端末側では一切集計しない |

### 2.2 データの流れ

```
[管理者] ─ git push（設定値・お知らせ・配布物）
   ▼
[マーケットプレースの git リポジトリ] ─ プラグインの自動更新 ─▶
   ▼
[端末の Claude Code]
   ├ SessionStart hook : settings.json へポリシー値を強制適用 /
   │                     適用した「値そのもの」を policy イベント化 / 未読のお知らせを表示
   └ 各種 hook         : 契約に定義されたキーだけを抽出 → ローカル JSONL に追記
   │
   │ HTTP POST /ingest（NDJSON バルク・detach プロセス）
   ▼
[収集サーバ] ◀─ [取込]ボタン ─ /mnt/data/csv/*.csv ◀─ 手動配置 ─ [AI Gateway 日次 CSV]
   │ 管理画面（4 枚）
   ▼
[管理者]
```

### 2.3 通信の非対称性

**「配信」は git、「収集」は HTTP。** サーバから端末へ何かを指示する経路は作らない。

この非対称性は意図的なものである。設定値もお知らせも配布物も、すべて git リポジトリの内容として端末に届く。したがって**サーバが停止してもガバナンスは止まらない**。停止したときに止まるのは測定だけであり、測定の欠損は後から回復できる（端末側に送信待ちが残る）が、ガバナンスの停止は回復できない。

### 2.4 サーバを 1 つにする理由

ガバナンスと利用ログでサーバを分けない。

- 配信を git が担うため、ガバナンス側にサーバ機能がほとんど残らない。残るのは「適用状況の受信と表示」だけで、これは利用ログと受信経路も画面も同じである
- 効果測定は `policy_state × cost_daily` の突き合わせである。分離するとプロセスをまたいだ結合が必要になり、永続領域のファイル共有や 2 系統の接続管理という、要件にない複雑さが生まれる
- 規模が小さい。日次 3〜5 万行は 1cpu × 4GiB の 1 コンテナに十分収まる

将来、受信処理が画面の応答を圧迫した場合は、**同じコード・同じ DB を指す 2 個目のプロセスを起こし、Ingress で `/ingest` だけそちらに振る**ことでコード変更ゼロで分離できる。この逃げ道があるため、今は分けない。

---

## 3. 端末プラグイン

### 3.1 ディレクトリ構成とファイルの責務

開発リポジトリ内のフォルダ名は `governance`。`plugin.json` の `name` も `governance`。

```
governance/
  .claude-plugin/plugin.json    # プラグイン定義（name / version / description）
  hooks/hooks.json              # hook 登録（どのイベントで何を呼ぶか）
  hooks/contract.py             # ★ 契約の正本。端末もサーバもこれ 1 つを読む
  hooks/collect.py              # 全 hook 共通のイベント収集エントリ
  hooks/session_start.py        # 設定適用 + お知らせ表示 + collect
  hooks/_context.py             # transcript 末尾から context_tokens を取る
  hooks/_queue.py               # ローカルキューへの追記・ローテート
  hooks/_sender.py              # detach して POST する独立プロセス
  hooks/_identity.py            # user_email / host / event_id の解決とキャッシュ
  hooks/_settings.py            # settings.json の読み書き（原子的置換）
  notices.json                  # お知らせ文面（ロジックを持たない純データ）
  config.json                   # 送信先 URL・受信トークン・送信条件
  skills/                       # 配布スキル
  commands/                     # 配布コマンド
```

`_` 始まりのファイルはプラグイン内部のモジュールであり、hook の入口にはならない。入口は `collect.py` と `session_start.py` の 2 つだけ。

**契約の正本を `governance/hooks/contract.py` に置く。** プラグインの中に置くことで、配布物にそのまま含まれ、端末側で追加の解決処理が要らない。サーバは開発リポジトリ内の相対パスからこのファイルを読む（§6）。

端末の状態は `~/.claude/cc-governance/` 配下に置く。

```
~/.claude/cc-governance/
  identity.json     # user_email / host / インストール識別子のキャッシュ
  seen.json         # 既読のお知らせ ID 集合
  queue.jsonl       # 送信待ちイベント（追記のみ）
  spool/            # 送信中・送信失敗のファイル
  sent_at           # 最終送信時刻（空ファイルの mtime で表現する）
```

### 3.2 収集する項目と取得元

`collect.py` は **hook の種類で分岐しない**。標準入力の JSON に対して、契約に定義されたキーパスを `dict.get` で順に引くだけである。来ないキーは `None` になる。

```python
# contract.py（抜粋・正本）
HOOK_FIELDS = (
    # (列名,            キーパス)
    ("session_id",      ("session_id",)),
    ("prompt_id",       ("prompt_id",)),
    ("tool_name",       ("tool_name",)),
    ("source",          ("source",)),
    ("compact_trigger", ("trigger",)),          # trigger は MySQL 予約語のため列名を変える
    ("command_name",    ("command_name",)),
    ("command_source",  ("command_source",)),
    ("skill_name",      ("tool_input", "skill")),
    ("effort_level",    ("effort", "level")),
    ("permission_mode", ("permission_mode",)),
    ("agent_id",        ("agent_id",)),
    ("is_interrupt",    ("is_interrupt",)),
)
```

これに加えて、端末側で組み立てる列がある。

| 列 | 取得元 |
| --- | --- |
| `event_id` | 端末で `uuid.uuid4()` を 1 イベントにつき 1 つ生成 |
| `ts` | `int(time.time())` |
| `day` | `ts` を JST に寄せた epoch 日（`(ts + 9*3600) // 86400`） |
| `user_email` | `_identity.py`（§3.8） |
| `host` | `platform.node()` |
| `hook_event` | hook 登録時にコマンド引数で渡す hook 名 |
| `context_tokens` | transcript 末尾から算出（§3.4） |

**`tool_input` は `skill` キーのみを名指しで読む。** dict 全体を保持・送信するコードは存在しない。プロンプト本文が入り得る `prompt` / `tool_response` / `message` には一切触れない。値は正規化も分類もせず、`str()` して生のまま送る（`None` は `None` のまま）。

これにより、**同じ 1 ファイルがどの hook からでも動く**。hook を増やしても収集コードは変わらず、Claude Code 側が hook を増やしても影響を受けない。

### 3.3 登録する hook

登録は必要な数種だけにとどめる。網羅登録はしない。

| hook | 目的 |
| --- | --- |
| `SessionStart` | 設定の適用・お知らせ表示・`source` の記録・送信のトリガ |
| `PostToolUse` | `tool_name` / `skill_name` / `agent_id` |
| `UserPromptSubmit` | `prompt_id` / `permission_mode`（本文は読まない） |
| `PreCompact` | `compact_trigger` + 圧縮直前の `context_tokens` |
| `Stop` | ターン終了時の `context_tokens` / `is_interrupt` / 送信のトリガ |

**どの hook にどのキーが実際に届くかは実測で確定する。**（現時点では未検証。上流の入力仕様を網羅した表は作らない。）`command_name` / `command_source` が届く hook が判明した場合は 1 種追加する。届かなければ列が NULL になるだけで、何も壊れない。

hook は**例外を握り潰し、常に `exit 0` する**。標準エラーにも出さない。利用者の画面を汚さず、Claude Code の動作を妨げないことを、収集の正確さより優先する。

### 3.4 コンテキスト使用量の取得

hook 入力の `transcript_path` を使い、**末尾 256KB だけを読む**。行を逆順に走査して最初に見つかった `message.usage` の 3 値を足す。全文パースはしない。

```python
def context_tokens(path, tail=256 * 1024):
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - tail))
            chunk = f.read()
    except OSError:
        return None
    for line in reversed(chunk.split(b"\n")):
        try:
            u = json.loads(line).get("message", {}).get("usage")
        except Exception:
            continue
        if u:
            return (u.get("input_tokens", 0)
                    + u.get("cache_creation_input_tokens", 0)
                    + u.get("cache_read_input_tokens", 0))
    return None
```

呼ぶのは `PreCompact` と `Stop` の 2 か所のみ。**率には変換せず、絶対値のまま送る。** 率にするとモデルごとの窓サイズ表という保守対象が生まれ、モデルが増減するたびに人手が要る。

### 3.5 蓄積と送信

**蓄積** — `~/.claude/cc-governance/queue.jsonl` に 1 行 1 イベントを追記する（`open(..., "a")` + 1 回の `write`）。ロックもインデックスも持たない。hook 内で行う同期 I/O はこの追記だけである。

**送信の起動条件** — `SessionStart` と `Stop` の末尾で、次のいずれかを満たすときだけ送信プロセスを起動する。

- `queue.jsonl` が 200 行以上
- 前回送信から 10 分以上経過

**起動方法** — `subprocess.Popen` による detach（`stdin/stdout/stderr` を `DEVNULL`、`start_new_session=True`）。hook 自身は待たずに即座に `exit 0` する。

**送信プロセスの動作**

1. `queue.jsonl` を `spool/<epoch>.jsonl` に `os.rename` する（アトミック。以降の hook は新しい `queue.jsonl` に追記する）
2. `spool/` 内のファイルを古い順に `POST /ingest` する（`Content-Type: application/x-ndjson`、タイムアウト 5 秒、トークンをヘッダに付与）
3. 2xx なら削除。それ以外は**残す**（次回まとめて再送される）

**送信失敗時** — リトライループも指数バックオフも ACK も持たない。失敗したファイルは `spool/` に残り、次の送信機会に自然に再試行される。サーバが半日停止しても自動で回復する。ただし `spool/` の合計が **5MB または 7 日**を超えたら、古いものから黙って削除する。永久に溜まる状態を作らない。

**重複と取りこぼし** — 再送で同じイベントが二重に登録されうるが、`event_id` があるため集計側の `COUNT(DISTINCT event_id)` で件数は正確になる。逆に、オフライン・spool 上限超過・hook 失敗による取りこぼしは**仕様として受け入れる**（§11）。

### 3.6 設定の自動適用

`session_start.py` が `~/.claude/settings.json` を読み、次を行う。

1. ポリシー値を**上書きする**
2. 差分がなければ書かない（毎回書き込んでタイムスタンプを汚さない）
3. 書き込みは一時ファイル + `os.replace` で原子的に行う
4. パース失敗時は**何もしない**（利用者の設定を壊さない方を優先する）
5. 適用後の**実際の値**を policy イベントとしてキューに積む

ポリシーの定義は契約の `POLICY` 1 か所に置く。

```python
POLICY = {
    "autoCompactThreshold": 70,   # コンテキスト自動圧縮の閾値
    "autoUpdate": True,           # プラグインの自動更新
}
```

**適用モードは「強制」のみである。** 利用者が施策を選択的に適用するモードは設けない。選択的適用を許すと、準拠者と非準拠者の差が「施策の効果」なのか「もともと意識の高い人が選んだから」なのかを区別できなくなり、効果測定の土台が崩れる。強制であれば、端末の起動タイミングのばらつきだけが差の原因になり、それを自然実験として使える。

施策を変えるときは `POLICY` を直して git push する。JSON カタログ化はしない。配信の実体が git push である以上、JSON を直すコストと Python を直すコストは同じであり、カタログを挟むだけ読む場所が増える。

> 上位の管理設定によって端末設定が上書きされる環境は想定しない。問題が生じた時点で対策を検討する。

### 3.7 お知らせの配信

`notices.json` はロジックを持たない純データである。

```json
[
  {"id": "2026-09-01-a", "title": "...", "body": "..."}
]
```

`session_start.py` が、ローカルの既読 ID 集合（`~/.claude/cc-governance/seen.json`）に無い項目を SessionStart の追加コンテキストとして出力し、既読に加える。**サーバもポーリング API も不要。** お知らせを追加する操作は、`notices.json` に 1 要素足して git push することである。

### 3.8 識別子

| 識別子 | 解決方法 |
| --- | --- |
| `user_email` | `git config --global user.email` を**初回のみ**解決して `identity.json` にキャッシュする。CSV の `User Email` と突合するため小文字化のみ行う |
| `host` | `platform.node()` |
| `event_id` | イベントごとに `uuid.uuid4()` を生成する。**主キーにも UNIQUE 制約にもしない**（§5.5） |

`user_email` を毎回 subprocess で取りに行かないのは、hook の実行時間に外部コマンド起動を含めないためである。

### 3.9 無効化スイッチ

環境変数 `CC_GOVERNANCE_DISABLE` が空でない値に設定されているとき、プラグインは**何もしない**。

- `collect.py` / `session_start.py` の冒頭 2 行で判定し、即 `exit 0` する
- 設定の適用もお知らせの表示もイベントの記録も送信も行わない

CI・スクリプトからの非対話実行・バッチ処理で Claude Code を動かす場面を想定している。これらは「人の利用」ではないため、測定に混ぜると数字が歪み、お知らせの出力は機械可読な出力を汚す。スイッチは 1 つだけで、部分的に止める仕組みは持たない。

---

## 4. サーバ

フォルダ名は `cc-governance-bmsd-server`。

### 4.1 ディレクトリ構成とファイルの責務

```
cc-governance-bmsd-server/
  app.py              # FastAPI アプリ・ルーティング・画面の組み立て
  ingest.py           # 受信 API の Pydantic モデルと NDJSON パース
  db.py               # 接続生成・プレースホルダ変換・DDL 適用（抽象はこの 3 つだけ）
  queries.py          # ★ SQL はすべてここ。他のどのファイルにも SQL を書かない
  csv_import.py       # CSV の走査・取込・冪等化
  shared.py           # 契約の正本を import するためのシム（4 行）
  templates/
    base.html
    overview.html     # /
    policy.html       # /policy
    effect.html       # /effect
    assets.html       # /assets
  requirements.txt
  Dockerfile
```

**SQL を `queries.py` 1 ファイルに集約する。他のどのファイルからも SQL を書かない。** これは DRY のためではなく、変更の影響範囲を 1 ファイルに閉じるためである。DB を別の製品に変える場合も、接続プールやトランザクション管理を足す場合も、変更はこのファイルの中だけで完結する。

### 4.2 技術選定と、過剰にしないための制約

| 項目 | 選択 | 理由 |
| --- | --- | --- |
| Web フレームワーク | FastAPI | 実行基盤が uvicorn（ASGI）で動くため、ASGI フレームワークが自然である。受信 API の契約を Pydantic で宣言的に書ける。OpenAPI スキーマが自動生成されるため、将来フロントエンドを分離する場合に型を共有できる |
| サーバ | uvicorn（`0.0.0.0:5000`・ワーカー 1） | 140 名規模では十分。プロセスマネージャを足す理由がない |
| テンプレート | Jinja2 | FastAPI の `Jinja2Templates` で同期的に描画する |
| サブパス | `FastAPI(root_path=os.environ["BASE_PATH"])` | ASGI の `root_path` にサブパスを渡すと、`url_for` が自動で追従する |
| DB | `sqlite3`（標準）/ `PyMySQL` | 接続先が 2 種類「現に存在する」ため、ここだけ抽象を入れる |
| フロント | 素の HTML + インライン CSS | JS ライブラリ・CDN 依存を持たない。棒グラフは `div` の `width: N%` |

#### 依存パッケージ

直接依存は 4 つ。

```
fastapi
uvicorn
jinja2
pymysql
```

推移的依存を含めて **16 パッケージ・3.3MB**。Python 3.9・manylinux2014 で**すべて既製ホイールが存在し、ビルド不要**であることを確認済みである。コンテナ起動のたびに `pip install` が走る実行基盤では、この大きさが起動時間に直結する。依存を足すことは設計上の判断事項として扱う。

#### 過剰にしないための制約

FastAPI は大きなフレームワークであり、機能を使い始めると構造が複雑になる。次の 3 つを制約として明記する。

1. **Pydantic モデルは受信 API の 1 つだけ。** 画面側では使わない。画面が扱うのは SQL の集計結果（タプルのリスト）であり、そこに型を被せても検査対象が増えるだけで、検査によって防げる誤りが無い
2. **`async` を使わない。** DB ドライバが同期であるため、非同期化しても速くならず複雑さだけが増える。すべてのエンドポイントを `def`（`async def` ではない）で書く。FastAPI は同期関数をスレッドプールで実行するため、ブロッキング I/O があっても他のリクエストを止めない
3. **FastAPI の高度な機能を使わない。** 多段の `Depends`・`BackgroundTasks`・WebSocket・ミドルウェアの自作を使わない。`Depends` は DB 接続の取得 1 段のみに限る

#### ORM を使わない

**SQLAlchemy を含む ORM を使わない。**

- MySQL と SQLite の両対応は、抽象レイヤを積むのではなく「方言が出る機能を使わない」ことで実現する（§5.5）。この方式なら**同じ SQL 文字列が両方の DB で動く**ため、ORM が提供する方言吸収の価値が無い
- 起動のたびに `pip install` が走る環境で、ORM の追加は起動時間の実費になる
- 扱うテーブルは 3 つ・すべて append-only で、リレーションの辿り方もオブジェクトのライフサイクル管理も必要ない

`db.py` が持つ抽象は次の 3 つだけである。依存性逆転はここで完結し、レイヤは積み増さない。

1. `connect()` — 環境変数 `DB_DSN` が `sqlite:///...` なら `sqlite3`、`mysql://...` なら `PyMySQL`
2. `q(sql)` — プレースホルダ変換。MySQL 接続時のみ `sql.replace("?", "%s")`（1 行）
3. `init()` — 契約から DDL を組み立てて実行

### 4.3 API

| メソッド | パス | 用途 |
| --- | --- | --- |
| POST | `/ingest` | NDJSON バルク受信。トークン認証 |
| GET | `/` | 概況 |
| GET | `/policy` | 適用状況 |
| GET | `/effect` | 効果測定 |
| GET | `/assets` | 配布物の利用状況 |
| POST | `/import` | `/mnt/data/csv/` の未取込 CSV を取り込む（画面上のボタン） |

#### `/ingest` の受信処理

1 リクエスト = 複数行の NDJSON。リクエストボディを `Request` から生のバイト列として受け取り、行ごとに Pydantic モデルで検証する。

```python
class IngestEvent(BaseModel):
    kind: str                      # "event" | "policy"
    event_id: str
    ts: int
    user_email: Optional[str] = None
    host: Optional[str] = None
    hook_event: Optional[str] = None
    # HOOK_FIELDS 由来の列は Optional[str]
    # policy 用の key_name / value も Optional[str]
    context_tokens: Optional[int] = None
    is_interrupt: Optional[int] = None
```

- **壊れた行は捨てて続行する。** 1 行の不正でリクエスト全体を失敗させない
- **常に 200 を返す。** 端末に判断させない。端末側は 2xx なら spool を消し、それ以外なら残すだけである
- `kind` で投入先テーブルを振り分け、`executemany` で 1 トランザクション INSERT する
- **値の語彙は検査しない。** 許可リストを持たない。上流が新しい値を出しても取りこぼさないことを、値の正しさより優先する
- `day` はサーバ側で `ts` から再計算する。端末の時計ずれが日次集計の軸を壊さないようにするため

Pydantic モデルを置くのはここだけである。受信は外部（端末）からの入力を受ける唯一の境界であり、境界に型を置く価値がある。

#### 認証

画面の認証は Ingress 側に委ねる。アプリケーションにログイン機構を持たない。

`/ingest` のみ、環境変数 `INGEST_TOKEN` と突き合わせるトークンで保護する。トークンはプラグインの `config.json` に平文で置き、配布物に含める。

> **このトークンは機密防御ではなく、誤送信の防止のために置く。到達制御はネットワーク境界（VPN）が担う。**

### 4.4 CSV 取込

`/mnt/data/csv/` を走査し、`cost_daily` に未登場のファイル名だけを処理する。

- ヘッダから契約の `CSV_COLUMNS` に**列挙された列だけ**を拾う。知らない列は捨てるため、CSV に列が増えても壊れない
- `Date` は `YYYY-MM-DD` を epoch 日に変換して `day` 列（INTEGER）に入れる
- `Provider` は生の文字列のまま保存し、**分離は集計時の `WHERE` で行う**。他社モデルの分類辞書を持たない
- 再取込は同一 `source_file` を `DELETE` してから `INSERT` する（UPSERT の方言を回避）

**起動は画面のボタンである。** 実行基盤に定期実行の仕組みが無いため、日次 1 回の手動クリックを正式な運用とする。監視デーモンやスケジューラを持ち込まない。

同時押下は想定しない。1 人の管理者が日次で押す前提である。

### 4.5 実行基盤とデプロイ

**現在は FaaS 基盤上で動かす。将来 Kubernetes 上で動かす可能性がある。**

起動コマンドは両方で同じである。

```
uvicorn app:app --host 0.0.0.0 --port 5000 --workers 1
```

| 項目 | 値 |
| --- | --- |
| `BASE_PATH` | 公開サブパス。`FastAPI(root_path=...)` に渡す |
| `DB_DSN` | `sqlite:////mnt/data/governance.db` または `mysql://user:pass@host/db` |
| `INGEST_TOKEN` | 受信トークン |
| `CSV_DIR` | 既定 `/mnt/data/csv` |

**Dockerfile を 1 枚用意する。** 内容は「ベースイメージ・`requirements.txt` の install・ソースのコピー・`CMD` で uvicorn 起動」だけの十数行である。起動コマンドが FaaS と同じであるため、Dockerfile があれば移行時の作業は最小になる。移行手順の詳細はここには書かない。

Dockerfile は契約の正本（`governance/hooks/contract.py`）とサーバのソースの両方をコピーする。

デプロイは、開発リポジトリの指定ブランチへの push で行う。

---

## 5. データモデル

テーブルは 3 つ。**すべて append-only、サロゲートキーなし、外部キーなし。**

### 5.1 `events` — 端末の利用ログ

| 列 | 型 | 意味 |
| --- | --- | --- |
| `event_id` | VARCHAR(36) | 端末が生成した UUID。重複排除に使う |
| `ts` | INTEGER | epoch 秒 |
| `day` | INTEGER | epoch 日（JST 基準）。突合・日次集計の軸 |
| `user_email` | VARCHAR(255) | 突合キー |
| `host` | VARCHAR(255) | 端末識別 |
| `hook_event` | VARCHAR(64) | どの hook から来たか |
| `session_id` `prompt_id` `tool_name` `source` `compact_trigger` `command_name` `command_source` `skill_name` `effort_level` `permission_mode` `agent_id` | VARCHAR(255) | `HOOK_FIELDS` から自動生成される列 |
| `is_interrupt` | INTEGER | 0 / 1 / NULL |
| `context_tokens` | INTEGER | transcript 由来。`PreCompact` / `Stop` のときのみ非 NULL |

インデックス: `(day, user_email)` / `(skill_name)` / `(tool_name)`

### 5.2 `policy_state` — 適用した設定値の時系列

| 列 | 型 | 意味 |
| --- | --- | --- |
| `event_id` | VARCHAR(36) | 端末が生成した UUID |
| `ts` | INTEGER | epoch 秒 |
| `day` | INTEGER | epoch 日 |
| `user_email` | VARCHAR(255) | |
| `host` | VARCHAR(255) | |
| `key_name` | VARCHAR(64) | 例: `autoCompactThreshold` |
| `value` | VARCHAR(255) | **適用した値そのもの**（`"70"`） |

インデックス: `(key_name, value, user_email)` / `(user_email, ts)`

縦持ちにする理由は 2 つ。施策項目が増えても DDL 変更が要らないこと、JSON 型の方言差を避けられることである。

**値そのものを記録する。** 版番号だけを記録すると、閾値 70 と 60 を区別できず、施策を変更したときに「どの値に準拠していたか」が失われる。効果測定の核はここにある。

- **準拠開始時点** = `key_name='autoCompactThreshold' AND value='70'` の `MIN(day)` を `user_email` で `GROUP BY`
- **準拠区間** = その日以降、別の値が現れるまで

SessionStart ごとに施策項目数の行が増えるだけなので、140 名 × 日数 × 2 項目で年間数十万行にとどまる。

### 5.3 `cost_daily` — AI Gateway CSV

| 列 | 型 |
| --- | --- |
| `day` | INTEGER（epoch 日） |
| `user_email` | VARCHAR(255) |
| `provider` `model` `currency` | VARCHAR(255) |
| `cost` | DOUBLE |
| `input_tokens` `output_tokens` `cache_read_tokens` `cache_write_tokens` `cached_input_tokens` `uncached_input_tokens` | BIGINT |
| `source_file` | VARCHAR(255)（冪等な再取込のため） |

インデックス: `(day, user_email)`

**突合は `user_email × day` の 2 軸に固定する。** モデル軸では突合しない。モデル名の表記揺れを吸収する名寄せ表は、モデルが増えるたびに人手を呼ぶ保守対象になる。`model` 列は保持するが、それは CSV 単独での内訳表示にのみ使う。

### 5.4 `event_id` の扱い

`event_id` は**主キーにも UNIQUE 制約にもしない**。

- UNIQUE 制約を置くと、重複 INSERT が DB エラーになり、エラーを無視する方法が方言で分かれる（`INSERT IGNORE` と `ON CONFLICT DO NOTHING`）。方言差を持ち込まないという方針に反する
- 主キーを置かないのは append-only で行を個別参照しないためであり、`event_id` も同じ理由で制約にしない

代わりに、**件数を数える集計はすべて `COUNT(DISTINCT event_id)` を使う**。送信のリトライで重複行が入っても件数は正確になる。重複行はストレージ上は残るが、規模から見て問題にならない。

`event_id` にインデックスは置かない。`COUNT(DISTINCT event_id)` は常に `day` などで絞り込んだ後の集計の中で使われるため、単独のインデックスが効く場面がない。（年間規模での実行時間は**未検証**。遅い場合は `(day, event_id)` の複合インデックスを足す。）

### 5.5 両 DB 対応の実現方法

抽象レイヤを積むのではなく、**方言が出る機能を使わない**ことで実現する。

| 方言が出る箇所 | 回避策 |
| --- | --- |
| `AUTOINCREMENT` / `AUTO_INCREMENT` | **主キーを持たない。** 3 テーブルとも append-only で、行を個別参照しない |
| 日時型・日付関数（`julianday` と `DATEDIFF`） | **日時型を使わない。** epoch 秒・epoch 日の INTEGER のみ。相対日は単なる整数の引き算 |
| UPSERT（`ON CONFLICT` と `ON DUPLICATE KEY`） | **使わない。** 再取込は `DELETE WHERE source_file=?` + `INSERT` |
| JSON 型・JSON 関数 | **使わない。** policy は縦持ち |
| TEXT へのインデックス長 | インデックス対象列を `VARCHAR(255)` にする（SQLite は TEXT として受理する） |
| プレースホルダ（`?` と `%s`） | SQL は `?` で書き、MySQL 接続時のみ `sql.replace("?", "%s")` |
| 真偽値 | INTEGER 0 / 1 |

結果、**DDL も集計 SQL も 1 本で両方に通る**。`CREATE TABLE IF NOT EXISTS` は両対応である。インデックスは MySQL 8.0 に `CREATE INDEX IF NOT EXISTS` が無いため、`SHOW INDEX` で存在確認してから作る分岐を `db.py` の `init()` に持つ（3 行）。

---

## 6. 契約（端末とサーバで共有する定義）

### 6.1 正本の位置

正本は `governance/hooks/contract.py` ただ 1 ファイルである。

- **端末** — プラグインの一部としてそのまま配布されるため、追加の解決処理が要らない
- **サーバ** — `cc-governance-bmsd-server/shared.py` が `sys.path` に `../governance/hooks` を足して import する。4 行のシムであり、サーバ側のコードはすべて `from shared import HOOK_FIELDS, ...` と書く

開発リポジトリ `cc-governance-bmsd` にプラグインとサーバを同居させるのは、この 1 ファイルを両者が直接参照できるようにするためである。契約が 2 か所にあると、同期ツールという新たな保守対象が生まれ、ずれたときに気づく手段が無い。参照が 1 つなら、ずれようがない。

### 6.2 契約が持つもの

`contract.py` が持つのは次の 4 つの定数と、そこから DDL を組み立てる関数 1 つだけである。

| 定数 | 導出されるもの |
| --- | --- |
| `HOOK_FIELDS` | ① 端末の抽出処理 ② `events` の DDL 列 ③ INSERT 文の列順 |
| `EXTRA_COLUMNS` | `event_id` `ts` `day` `user_email` `host` `hook_event` `context_tokens` `is_interrupt` の型定義 |
| `POLICY` | ① 端末が適用する設定値 ② `policy_state` に記録する `key_name` / `value` ③ 画面の準拠判定 |
| `CSV_COLUMNS` | ① CSV ヘッダ → 列名の対応 ② `cost_daily` の DDL ③ INSERT 文 |

DDL 生成は 10 行程度の関数 1 つで済む。列型が VARCHAR / INTEGER / BIGINT / DOUBLE の 4 種しかなく、分岐が少ないためである。

**同期ツールも差分検査ツールも作らない。**

### 6.3 これは設定ファイルではない

`HOOK_FIELDS` は挙動を切り替える設定ファイルではない。「どのキーパスがどの列になるか」という**単一の事実**である。書き換えたときに変わるのは列の集合だけで、処理の構造は変わらない。したがって、これを読み込んで動作を分岐させるコードは存在しない。

---

## 7. 管理画面

画面は 4 つ。すべて SQL の `GROUP BY` 1〜2 本で、表と CSS バーだけで描く。

### 7.1 `/effect` 効果測定 — 「閾値の強制はコストを下げたか」

システムの存在理由に最も近い画面。

**イベントスタディ** — 端末ごとの準拠開始日を 0 日目とし、相対日 −14 〜 +14 の「1 人あたり日次コスト」「1 人あたり日次入力トークン」を平均して折れ線（表 + CSS バー）で出す。端末の起動タイミングのばらつきが自然実験として機能する。

**コンテキスト分布** — `PreCompact` 時の `context_tokens` のヒストグラムと、`Stop` 時の `context_tokens` のヒストグラム。準拠前後で 2 本並べる。前者は閾値の妥当性（70 のままでよいか、下げるべきか）の直接材料になり、後者は「限界にどれだけ近いか」を示す。

**準拠者数の推移** — 分母の透明性のため。

元になるクエリは 2 本。相対日の計算は epoch 日の引き算なので両 DB で同一である。

```sql
-- 準拠開始日
SELECT user_email, MIN(day) AS d0 FROM policy_state
 WHERE key_name = ? AND value = ? GROUP BY user_email;

-- 日次コスト（指定 provider 分のみ）
SELECT user_email, day, SUM(cost), SUM(input_tokens) FROM cost_daily
 WHERE provider = ? GROUP BY user_email, day;
```

2 本の結果（それぞれ約 140 行・数万行）を Python で突き合わせて相対日に畳む。**これは全走査ではなく集計済み結果の後処理**であり、行数は端末数 × 日数に抑えられている。

### 7.2 `/policy` 適用状況 — 「どの端末がポリシーに準拠しているか」

- 準拠率（施策項目別）
- **未準拠者の一覧**（`user_email` / `host` / 最後に観測した値 / 最終観測日）。実務上ここが最も使われる。声かけ対象がそのまま出る
- 7 日以上イベントが来ていない端末（離脱、または収集の停止の兆候）

```sql
SELECT user_email, host, value, MAX(ts) FROM policy_state
 WHERE key_name = ? GROUP BY user_email, host, value;
```

### 7.3 `/assets` 配布物の利用状況 — 「配ったものは使われているか」

- `skill_name` 別の呼出回数・利用者数・直近 7 日と前 7 日の比較
- `command_name` × `command_source` 別（社内配布か個人設定かの切り分け）
- `agent_id` の有無によるサブエージェント利用の割合

```sql
SELECT skill_name,
       COUNT(DISTINCT event_id),
       COUNT(DISTINCT user_email)
  FROM events
 WHERE skill_name IS NOT NULL AND day >= ?
 GROUP BY skill_name
 ORDER BY 2 DESC;
```

**値の分類辞書を持たない**ため、社内配布のスキルと個人のスキルは `command_source` の生値でそのまま並ぶ。どれが社内配布かは見る人が知っている。

### 7.4 `/` 概況 — 「全体でいくらかかり、誰が使っているか」

- 日次コスト推移（`provider` 別の内訳をそのまま表示。他社モデルは別行として見えるだけで、分類処理はしない）
- 利用者数・セッション数の推移
- `permission_mode` / `effort_level` / `source` の分布（生値のまま）
- **健全性の 1 行**（§9.2）

### 7.5 作らない画面

- 端末ごとのドリルダウン詳細 — 誰が何をしたかの監視は目的ではない
- セッション単位のタイムライン — 会話本文がない以上、見ても読めない
- リアルタイムダッシュボード — コストの正本が日次である以上、意味がない

---

## 8. マーケットプレイスと配布

設定値もお知らせも配布物も、サーバからの配信ではなく **git によるプラグイン更新**で端末に届く。したがって配布経路は設計の一部である。

### 8.1 リポジトリの分離

| リポジトリ | 役割 |
| --- | --- |
| `cc-governance-bmsd` | 開発リポジトリ。プラグイン（`governance/`）とサーバ（`cc-governance-bmsd-server/`）を同居させ、**収集項目の契約を 1 か所で共有する** |
| `cc-marketplace-governance-bmsd` | 配布用マーケットプレイス。**完成したプラグインを差し込む箱**であり、開発中のコミットは入れない |

**なぜ分けるか** — マーケットプレイスは全利用者の端末が直接 clone する先であり、そこに開発の履歴（作業中のコミット・サーバのソース・実験ブランチ）を混ぜると、配布物の内容と履歴の両方が肥大する。配布経路には「配るものだけ」を置く。

### 8.2 マーケットプレイスリポジトリの構造

```
cc-marketplace-governance-bmsd/
  .claude-plugin/marketplace.json
  plugins/
    governance/             # 開発リポジトリの governance/ をそのまま差し込む
      .claude-plugin/plugin.json
      hooks/
      skills/
      commands/
      notices.json
      config.json
```

`.claude-plugin/marketplace.json` に書くのは、マーケットプレイス自体の名前と所有者、そして収録プラグインの一覧である。

```json
{
  "name": "cc-marketplace-governance-bmsd",
  "owner": { "name": "<管理チーム名>", "email": "<連絡先>" },
  "plugins": [
    {
      "name": "governance",
      "source": "./plugins/governance",
      "description": "Claude Code のガバナンス設定の適用・お知らせ配信・利用状況の収集"
    }
  ]
}
```

`source` は同一リポジトリ内の相対パスを指す。プラグインの実体を別リポジトリに置いて参照する形も取れるが、収録が 1 つである以上、同梱が最も単純である。

### 8.3 リリース手順

1. 開発リポジトリ `cc-governance-bmsd` で変更をマージする（設定値の変更・お知らせの追加・スキルの追加・収集項目の追加など）
2. `governance/.claude-plugin/plugin.json` の `version` を上げる。**バージョンを上げる場所はここ 1 か所だけである**
3. 開発リポジトリの `governance/` を、マーケットプレイスリポジトリの `plugins/governance/` へ差し込む（フォルダの内容をそのまま置き換える）
4. マーケットプレイスリポジトリで PR を作り、マージする
5. マージされた時点で配布される

`plugin.json` の `version` は、端末側が更新の要否を判断する唯一の手がかりである。中身を変えて `version` を上げ忘れると、端末に届かない。

### 8.4 利用者への導入手順

マーケットプレイスを登録する。

```
/plugin marketplace add <org>/cc-marketplace-governance-bmsd
```

プラグインを導入する。

```
/plugin install governance@cc-marketplace-governance-bmsd
```

導入後、最初の SessionStart で設定の適用とお知らせの表示が働く。

### 8.5 更新の伝播

- 端末は**セッション開始時**にマーケットプレイスの更新を取得し、新しい `version` があれば適用する。利用者の操作は不要である
- したがって、施策を変更してから全端末に行き渡るまでの時間は、利用者が Claude Code を起動する頻度に依存する。全員に届くまで数日かかることを前提に、効果測定は「日付」ではなく「端末ごとの準拠開始日」を基準にする（§7.1）

**自動更新が無効化されていた場合** — プラグインの自動更新が切られていると、施策の変更が永久に届かなくなる。これを防ぐため、`POLICY` に `autoUpdate: True` を含め、SessionStart のたびに `settings.json` へ強制適用する（§3.6）。古い版のプラグインであっても、この処理自体は動作するため、**自動更新は自分で自分を回復する**。自動更新の強制は、施策の 1 つであると同時に、配布経路そのものを成立させる必須機能である。

---

## 9. 上流仕様の変化への備え

### 9.1 変化したとき何が起きるか

| 上流の変化 | 起きること | 壊れるか |
| --- | --- | --- |
| hook 入力にキーが**増える** | 何も起きない（取らない） | 壊れない |
| キーが**改名・消滅**する | その列が以後 NULL になる | 壊れない・**静かに欠測する** |
| hook の**種類が増える** | 登録していないので来ない | 壊れない |
| hook の**入力形式が変わる** | 収集処理が例外 → 握り潰し → イベントが止まる | 壊れない・**静かに止まる** |
| transcript の `usage` 構造が変わる | `context_tokens` が NULL になる | 壊れない・静かに欠測する |
| `settings.json` の**設定キー名が変わる** | 設定の適用が空振りする | **施策が無効化される（最も重大）** |
| CSV に列が増える | 知らない列を捨てる | 壊れない |

**どの変化でも Claude Code の動作は妨げられない**（hook は常に `exit 0`）。問題はすべて「静かに欠測する」形で現れる。

### 9.2 どう気づくか

**概況画面の隅に「健全性」の 1 行を出す。** アラート機構・通知・監視デーモンは作らない。

```
健全性（直近7日 / 前7日）: イベント 38,210 / 41,003 ・ 送信端末 128 / 131
  NULL率  tool_name 0.2%/0.2%  skill_name 91%/90%  context_tokens 88%/87%  permission_mode 0.1%/0.1%
```

読み方は 3 つだけである。

- **イベント件数の急落** → hook 入力形式の変化・収集の停止
- **特定列の NULL 率が急に 100% に跳ねる** → キーの改名・消滅
- **準拠率の急落**（`/policy`）→ `settings.json` の設定キー名の変化

SQL は `SELECT COUNT(DISTINCT event_id), SUM(CASE WHEN col IS NULL THEN 1 ELSE 0 END) ... GROUP BY` の 1 本。実装は 20 行程度である。

これで全部を検知できるとは主張しない。**検知できるのは「来ていたものが来なくなったこと」だけ**であり、それで十分と判断している。新しいキーが増えたことは、そもそも知る必要がない。

### 9.3 人手で追随する箇所

**2 か所だけ**である。

1. `contract.py` の `HOOK_FIELDS` — キーパスの改名時
2. `contract.py` の `POLICY` — `settings.json` のキー名変更時・施策変更時

どちらも `contract.py` の中にある。**保守の負債は 1 ファイルに閉じている。**

---

## 10. 設計判断

| # | 論点 | 採った案 | 採らなかった案と理由 |
| --- | --- | --- | --- |
| 1 | サーバの数 | **1 プロセス** | *ガバナンスとログで 2 分割* — 配信が git である以上ガバナンス側にサーバ機能がほぼ無く、効果測定は 3 テーブルの突合。分けるとプロセス間結合という要件にない問題が生まれる |
| 2 | リポジトリ構成 | **開発 1 + 配布 1** | *全部を 1 リポジトリ* — 配布経路に開発の履歴が混ざる。*契約をプラグイン側とサーバ側に複製* — 同期ツールという保守対象が生まれる |
| 3 | Web フレームワーク | **FastAPI** | *WSGI フレームワーク* — 実行基盤が ASGI である以上、変換層を挟むことになる。*素の ASGI* — ルーティングとテンプレート結合を自前で書くことになる |
| 4 | 非同期 | **使わない（すべて `def`）** | *`async def` で書く* — DB ドライバが同期であるため速くならず、同期呼び出しの混入でイベントループを止める危険だけが増える |
| 5 | Pydantic の適用範囲 | **受信 API の 1 モデルのみ** | *画面の表示データにも型を置く* — 検査対象が増えるだけで、検査で防げる誤りが無い |
| 6 | DB アクセス | **生 SQL + `queries.py` に集約** | *ORM* — 方言吸収の価値が無く（方言機能を使わない設計のため）、起動時の install が実費になり、レイヤが 1 段増える |
| 7 | MySQL / SQLite 両対応 | **方言が出る機能を使わない**（主キーなし・epoch INTEGER・UPSERT 不使用・JSON 不使用） | *方言ごとの DDL 2 本* — 同じ定義が 2 か所になる。*自動採番 id / 日時型 / UPSERT / JSON 列* — いずれも方言が分岐し、分岐の数だけ検証対象が倍になる |
| 8 | 重複排除 | **`event_id` + `COUNT(DISTINCT)`** | *UNIQUE 制約* — 重複 INSERT のエラー無視が方言で分かれる。*重複を放置* — 再送のたびに件数が水増しされ、相対比較すら成り立たなくなる |
| 9 | policy の持ち方 | **縦持ち（key_name, value）** | *JSON 列* — JSON 関数の方言差。*施策ごとの横列* — 施策追加のたび DDL 変更 |
| 10 | 準拠の記録 | **適用値そのもの** | *版番号だけ* — 閾値 70 と 60 を区別できない |
| 11 | 施策の適用モード | **強制のみ** | *利用者が選択的に適用* — 準拠者と非準拠者の差が施策の効果なのか自己選択なのか区別できず、効果測定が成立しない |
| 12 | 通知の配信 | **`notices.json` を git で配り端末が表示** | *サーバのポーリング API* — サーバ停止で通知が止まる。配信の実体が git である前提に反する |
| 13 | 収集の抽出 | **キーパスを名指しで `get`** | *hook 入力を丸ごと保存して後で選別* — `tool_input` にプロンプト本文が入るため、上流が自由文キーを足した瞬間に流出する |
| 14 | hook 登録 | **5〜6 種のみ・共通エントリ** | *全 hook を網羅登録* — 種類が増え続けるため網羅は原理的に達成できず、維持コストだけが残る |
| 15 | 送信 | **hook 内は追記のみ・送信は detach** | *hook 内で同期 POST* — Claude Code の応答をネットワーク遅延でブロックする。体感を損なう施策は推進の妨げになる |
| 16 | 送信の信頼性 | **spool ファイル + 上限で破棄** | *ローカル DB + ACK + 再送制御* — 高い正確性が要求されていないのに、端末側に DB とトランザクション管理を持ち込むことになる |
| 17 | `context_tokens` | **絶対値のみ** | *使用率* — モデルごとの窓サイズ表が必要になり、モデルの増減が保守を呼ぶ |
| 18 | トークン / コスト | **CSV が正本。端末で集計しない** | *端末側での積算* — CSV の方が項目数も多く正確。二重取得は不一致の調停コストを生む |
| 19 | 突合軸 | **`user_email × 日`** | *モデル軸を含む突合* — 表記揺れの名寄せ表という保守対象が生まれる |
| 20 | 集計の実行場所 | **SQL の `GROUP BY`** | *アプリ側での全走査* — 行数に線形なメモリと応答時間。イベントスタディの畳み込みのみ、集計後の数千行に対してアプリ側で行う |
| 21 | 値の解釈 | **生の文字列のまま保存** | *許可リスト・分類辞書* — 上流が新しい値を出した瞬間に取りこぼす。解釈は集計時に行えば十分 |
| 22 | 設定適用の失敗時 | **何もしない** | *壊れた settings.json を修復・再生成* — 利用者の設定を壊すリスクが、ポリシー適用の利益を上回る |
| 23 | フロントエンド | **素の HTML + CSS** | *チャートライブラリ* — CDN 到達性が不明で、表と棒で判断には足りる |
| 24 | 監視 | **概況画面の健全性 1 行** | *アラート・通知・定期実行の監視* — 日次で見る画面に 1 行あれば気づける |
| 25 | CSV 取込の起動 | **画面のボタン** | *定期実行* — 実行基盤に仕組みが無い。日次 1 クリックが最も正直で最小 |
| 26 | コンテナ化 | **Dockerfile 1 枚** | *マニフェスト一式* — 現時点で必要がなく、起動コマンドが同じである以上、移行時に書けばよい |

---

## 11. この設計で答えられないこと

### 11.1 原理的に答えられない問い

- **「誰がどんなタスクに使ったか」** — 会話本文もプロンプトも保持しないため答えられない。これは制約ではなく設計の前提であり、代わりに `skill_name` / `command_name` / `tool_name` の分布で間接的に見る
- **「1 人が複数台使っているときの端末別コスト」** — コストの正本が利用者粒度のため按分できない。`host` は準拠状況の把握にのみ使う
- **「取りこぼしを含めた正確な利用回数」** — オフライン・spool 上限超過・hook 失敗で黙って落ちる。`event_id` が防ぐのは重複であって欠損ではない。イベント件数は**相対比較にのみ使い、絶対値としては扱わない**
- **「閾値以外の要因を除いた純粋な因果効果」** — 準拠タイミングの自己選択バイアス（早く再起動する人はもともとヘビーユーザーかもしれない）は残る。イベントスタディは自然実験の**近似**であり、相対日の傾きを見るための道具と位置づける
- **「他社モデルの利用実態」** — CSV の `provider` 別内訳として見えるだけ。端末ログは Claude Code のものしかない

### 11.2 意図的な割り切り

- **`user_email` は端末の自己申告**であり、詐称を防げない。140 名の社内向けであり、目的が監査ではなく施策評価であることから受容する
- **受信トークンは機密防御ではない。** 誤送信の防止のために置く。到達制御はネットワーク境界が担う
- **リアルタイム性がない。** 端末からサーバへは分単位、コストは日次
- **画面の認証を Ingress に委ねる。** アプリケーションにログイン機構を持たない
- **データの削除・保持期間の設計を持たない。** 年間 1,500 万行は問題にならず、必要になった時点で `DELETE WHERE day < ?` を足せばよい
- **`/import` は同時押下を想定しない。** 1 人の管理者が日次で押す前提
- **テストは受信から集計までの往復 1 本と、契約からの DDL 生成 1 本に留める。** 画面と hook の統合テストは持たない。Claude Code 本体の挙動に依存するため、実測での確認に委ねる

### 11.3 未検証の事項

- **どの hook にどのキーが実際に届くか**（§3.3）。列が NULL になるだけで壊れないが、初期の実測で確定させる
- **`COUNT(DISTINCT event_id)` の年間規模での実行時間**（§5.4）
- **MySQL 接続時の DDL 適用**。インデックスの存在確認分岐を含め、両 DB での初期化は実機で確認する
- **実行基盤上での uvicorn の起動時間**。依存 16 パッケージ・3.3MB の install を含めた所要時間は未計測

---

## 12. 実装規模の見積もり

| 構成要素 | 想定行数 | 備考 |
| --- | --- | --- |
| `governance/hooks/contract.py` | 70 | **正本**。4 定数 + DDL 組立関数 |
| `governance/hooks/collect.py` | 55 | 全 hook 共通の抽出エントリ |
| `governance/hooks/session_start.py` | 80 | 設定適用 + お知らせ + collect |
| `governance/hooks/_context.py` | 25 | transcript 末尾の読み取り |
| `governance/hooks/_queue.py` | 45 | 追記・ローテート・上限での破棄 |
| `governance/hooks/_sender.py` | 60 | detach プロセス。POST と spool 管理 |
| `governance/hooks/_identity.py` | 30 | user_email / host / event_id |
| `governance/hooks/_settings.py` | 40 | settings.json の読み書き |
| `governance/*.json`（plugin / hooks / notices / config） | 55 | 設定・データ |
| **端末プラグイン 小計** | **460** | |
| `server/app.py` | 80 | FastAPI アプリ・ルーティング・テンプレート描画 |
| `server/ingest.py` | 65 | Pydantic モデル + NDJSON パース + executemany |
| `server/db.py` | 75 | 接続・`?` 変換・DDL 適用 |
| `server/queries.py` | 140 | 集計 SQL 8 本 + イベントスタディの畳み込み |
| `server/csv_import.py` | 70 | 走査・取込・冪等化 |
| `server/shared.py` | 5 | 契約 import のシム |
| `server/templates/*.html`（4 枚 + base） | 210 | 素の HTML + インライン CSS |
| `server/Dockerfile` / `requirements.txt` | 20 | |
| **サーバ 小計** | **665** | |
| マーケットプレイス（`marketplace.json`） | 15 | |
| **合計** | **約 1,140 行** | Python 実コードは約 840 行。1 ファイルはすべて 200 行以内に収まる |

---

## 改訂履歴

| 日付 | 版 | 変更内容 |
| --- | --- | --- |
| 2026-09-21 | 1.0 | 初版 |
