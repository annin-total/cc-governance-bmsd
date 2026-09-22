# 3 リポジトリへの再編

開発環境が個人の作業領域になっており、成果物と作業の残骸が同じ場所に混在している。
**成果物だけで自己完結させ、それ以外を丸ごと捨てられる状態にする。**

## 1. 何を作るか

| リポジトリ | 役割 | 独立している理由 |
| --- | --- | --- |
| `cc-governance-bmsd` | 統合開発環境。プラグインのソース、統合テスト、横断ドキュメント | ユニットをまたぐ不変条件を検査できる唯一の場 |
| `cc-governance-monitor` | 集計サーバ | **実行基盤がリポジトリを `git clone` する。**プラグインを実行環境へ持ち込まない |
| `cc-marketplace-governance-bmsd` | 配布用マーケットプレイス | アクセス権限の範囲が違う（BMSD 全体に読み取り公開） |

**自己完結の単位はこの 3 つ全体である。**3 つ以外のフォルダをすべて削除しても、開発と運用が成立する。

作らないもの — 他部署向けの雛形の実体、プラグインの配布までの作業、普及率の集計。

## 2. 配置

```
Development/
  bmsd-governance/                        ← 中間。プロジェクト全体
    product/                              ← 成果物。削除不可
      cc-governance-bmsd/
      cc-marketplace-governance-bmsd/
    cc-governance/                        ← 旧作業領域。丸ごと削除してよい
```

**境界はディレクトリで引く。**`product/` の外は、いつ消しても成果物に影響しない。

3 リポジトリはいずれも独立した git リポジトリである。ディレクトリごと動かせば履歴も動く。

## 3. ディレクトリ構成

### `cc-governance-bmsd`（統合開発環境）

```
README.md
CLAUDE.md
plugin/                    ← 配布物そのまま。テストも生成物も置かない
  .claude-plugin/plugin.json
  hooks/                   ← contract.py の正本はここ
  config.json  notices.json
server/                    ← submodule → cc-governance-monitor
tests/
  plugin/                  ← プラグイン単体
  integration/             ← 契約の一致・端末からサーバへの往復・実採取フィクスチャ
  fixtures/
verification/              ← 実機検証スクリプト
docs/
  CLAUDE.md                ← docs の参照規約
  SPEC.md                  ← 全体像。何が何とどう繋がるか
  SPEC-plugin.md           ← プラグインの仕様
  onboarding.md            ← 導入案内
  release.md               ← 差し込み手順
  knowledge/               ← 外界の事実
  decisions.md             ← 契約とプラグインに関する判断
  remaining/               ← 残タスク
pytest.ini  ruff.toml  requirements-dev.txt
scripts/sync_contract.py
scripts/validate_plugin.py
```

**`plugin/` にテストを置かない。**そのまま配布されるため、置けば利用者の端末に届く。

### `cc-governance-monitor`（サーバ）

```
README.md
CLAUDE.md
app.py  db.py  ingest.py  csv_import.py  queries_events.py  queries_policy.py
contract.py                ← 複製。生成物であることをヘッダに書く
contract.sha256            ← 正本のハッシュ
templates/
tests/
docs/
  SPEC.md                  ← サーバの仕様
  AIP-DEPLOY.md            ← 実行基盤へのデプロイ手順
  decisions.md             ← サーバに関する判断
entry.sh  Dockerfile  compose.yaml  requirements.txt
```

**ローカル開発は `docker compose up` だけで完結する。**開発機の OS を問わない。

### `cc-marketplace-governance-bmsd`（配布）

```
README.md                  ← 何のマーケットプレイスか、差し込み手順、雛形としての使い方
.claude-plugin/marketplace.json
plugins/governance/        ← プラグインの複製
templates/plugin/          ← プラグインの雛形
  .claude-plugin/plugin.json
  skills/example/SKILL.md
  README.md
scripts/validate.py
```

**マーケットプレイスの雛形は実体を作らない。**この構造がそのまま雛形である、と README に書く。
使われない実体を置くと、腐ったまま残る。

## 4. 契約の同期

契約（`contract.py`）は端末とサーバで共有する定義の正本である。
両者は実行時に互いを参照できない。端末は配布され、サーバは単独でデプロイされる。

### 正本と複製

| 場所 | 役割 |
| --- | --- |
| `plugin/hooks/contract.py` | **正本。**配布物として端末に同梱される |
| `server/contract.py` | 複製。先頭に生成物である旨のヘッダを持つ |
| `server/contract.sha256` | 正本のハッシュ。複製と一緒にコミットする |
| `scripts/sync_contract.py` | コピーとハッシュ更新。`--check` で検証のみ |

**正本をプラグイン側に置く理由** — プラグインは標準ライブラリのみ・未知の端末 python という
最も厳しい制約下にある。正本をサーバ側に置くと、サーバの依存を契約に書き込むことを何も止めず、
**壊れるのは端末側になる。**正本を厳しい側に置けば、誤りは安い場所で顕在化する。

### 検査は 2 層

契約がずれると、受信処理はサーバ側の列定義を回して値を引くため、
**増えた項目は黙って捨てられ、減った項目は黙って NULL になる。**エラーにならない。

| 層 | 何を捕まえるか | どこで走るか |
| --- | --- | --- |
| サーバ起動時 | 複製を直接編集したこと | `entry.sh`。正本が手元に無くても効く |
| 統合環境のテスト | 正本が動いたのに同期していないこと | `pytest`。リントと一緒に走る |

### 契約の変更は追加のみとする

**列の改名と型変更をしない。**配布は手動で、自動更新は端末ごとに時間差で降りるため、
版の混在は必ず起きる。追加のみなら、混在は設計上安全である。
新しい列はサーバが追いつくまで黙って捨てられ、古い列は動き続ける。

列を廃止したいときは、契約から消さずに新しい列を足し、古い列を使わなくする。

## 5. ドキュメント

### 観点を「設計書」から「仕様書」へ移す

**何がどうなっているかという事実だけを書く。**なぜそうしたかは `decisions.md` が持ち、
未検証のことは `remaining/` が持つ。仕様書はこの 2 つを本文に混ぜない。

仕様書の構成 — 概要 / 構成 / 規約 / 運用設計 / 仕様一覧。
**「未確定事項・未検証事項」の章は持たない。**`remaining/unverified.md` の責務である。

### 現行の設計書の行き先

| 現行の章 | 行 | 行き先 |
| --- | --- | --- |
| 目的と範囲 / 全体構成 | 88 | `cc-governance-bmsd/docs/SPEC.md` |
| 端末プラグイン / 契約 / 上流仕様の変化への備え | 430 | `cc-governance-bmsd/docs/SPEC-plugin.md` |
| サーバ / データモデル / 管理画面 | 612 | `cc-governance-monitor/docs/SPEC.md` |
| マーケットプレイスと配布 | 132 | `cc-marketplace-governance-bmsd/README.md` |
| 設計判断 | 41 | `decisions.md` へ吸収。**既存との重複を精査する** |
| この設計で答えられないこと | 46 | `remaining/` |
| 実装規模の見積もり | 35 | **捨てる。**実装が完了した時点で役目を終えている |

理由と未検証を抜き、見積もりを捨てれば、合計 800 行前後に収まる見込みである（**未検証の見積もり**）。

### 置き場の規約

- `knowledge/` と `remaining/` は**統合開発環境に 1 つだけ**置く。3 つ全体が自己完結の単位である
- `decisions.md` は仕様書の分割に追従する。契約とプラグインの判断は統合環境、サーバの判断はサーバ
- **サーバのドキュメントは `knowledge/` を参照しない。**必要な外界の事実はその場に書く。
  外界の事実は複製してもドリフトしない
- 実行基盤へのデプロイ手順（`AIP-DEPLOY.md`）は永続文書としてサーバに置く。
  `remaining/deploy.md` の未検証項目とは別物である
- **社内のホスト名を `cc-marketplace-governance-bmsd` に持ち込まない。**このリポジトリだけ読み取り公開の範囲が広い

## 6. テストの責務分離

| 置き場 | 対象 |
| --- | --- |
| `cc-governance-bmsd/tests/plugin/` | 契約の意味論（`coerce` `dig` `ddl` `to_day` と定数）、hook の各モジュール |
| `cc-governance-bmsd/tests/integration/` | 契約の一致、端末からサーバへの往復、実採取フィクスチャ |
| `cc-governance-monitor/tests/` | 受信、DB、CSV 取込、集計クエリ、画面 |

契約のテストはプラグイン側に置く。正本がそこにあるためである。
サーバ側は複製の一致だけを見て、契約の意味論は見ない。

`sys.path` のシムを検査していたテストは、シムの廃止とともに消える。契約一致の検査が役目を引き継ぐ。

## 7. 検証スクリプトの内部化

旧作業領域にある実機検証スクリプトを `cc-governance-bmsd/verification/` へ移す。
**何を確かめるスクリプトかを 1 行ずつ添える。**他の開発担当者が読んで使えることを条件とする。

| 群 | 中身 |
| --- | --- |
| フィクスチャの無害化 | hook stdin を再採取するたびに要る |
| hook の実挙動の採取 | 圧縮前、transcript 末尾、スキル名、プラグインのデータ領域、スクリプト名、お知らせ |
| 自動更新の検証 | 擬似 git サーバ一式と、擬似マーケットプレイス 2 組（bare リポジトリと作業コピー）。更新が端末へ降りるまでを隔離環境で再現する |
| 性能測定の再現 | SQLite のベンチ、MySQL のスキーマと索引 |

## 8. 移行手順

**順序に意味がある。**契約の同期機構をサーバの切り出しより先に作る。
先に切り出すと、複製が正本と一致しているかを確かめる手段が無い状態で作業することになる。

### 段 1. 救出と移動

- 検証スクリプトを `verification/` へ移す
- 3 リポジトリを `Development/bmsd-governance/product/` へ移す

**終わりの判定** — 移動後に全テストが緑。`product/` の外を削除しても成果物が壊れないことを、
実際には削除せず、参照の有無で確かめる。

### 段 2. リネームと再配置

- `governance/` → `plugin/`
- `cc-governance-bmsd-server/start.sh` → `entry.sh`
- テストを `tests/plugin/` `tests/integration/` `tests/server/` に分ける

**終わりの判定** — 全テストが緑。`claude plugin validate plugin --strict` が通る。

**注意** — 実採取フィクスチャに含まれるパス文字列は、採取時点の記録である。**書き換えない。**

### 段 3. 契約の同期機構

- `scripts/sync_contract.py` を作る
- サーバ側に `contract.py` の複製と `contract.sha256` を置く
- `shared.py` を廃止し、サーバは自分の `contract.py` を import する
- 検査 2 層をテストと `entry.sh` に入れる

**終わりの判定** — 複製を 1 文字書き換えると起動が止まり、テストが落ちる。
正本を 1 文字書き換えると統合テストが落ちる。**両方を実際に壊して確かめる。**

### 段 4. サーバの切り出し

- `cc-governance-monitor` を新規に作る（履歴は引き継がない）
- サーバ一式・サーバのテスト・サーバのドキュメントを移す
- 統合環境に submodule として `server/` にマウントする

**終わりの判定** — サーバ単体で `docker compose up` が通り、`/health` が応答する。
統合環境で全テストが緑。

### 段 5. ドキュメントの再編

- 設計書を §5 の表に従って分割する
- `decisions.md` を分割し、重複を精査する
- `AIP-DEPLOY.md` を作る

**終わりの判定** — 参照規約に違反する参照が 0 件。各仕様書に理由と未検証が混ざっていない。

### 段 6. マーケットプレイス

- `templates/plugin/` を作る
- `scripts/validate.py` を `claude plugin validate` に委譲して縮める
- remote を設定する

**終わりの判定** — `claude plugin validate . --strict` と `templates/plugin --strict` が通る。

### 段 7. 片付け

- `cc-governance/` を削除可能な状態にする

**終わりの判定** — `product/` の中から `product/` の外を指す参照が 0 件。

**注意** — 旧作業領域には、**プロジェクトの外を指すシンボリックリンクが含まれる。**
ディレクトリごと消せばリンクだけが消えるが、リンクの中を指定して消すと実体が消える。
削除は必ずリンクをたどらない形で行う。

## 9. 全体の完了条件

1. `product/` の外をすべて削除しても、3 リポジトリで開発・検証・デプロイ・配布が成立する
2. 3 リポジトリの外を指す参照が、ドキュメント・コード・設定・コミットメッセージのいずれにも無い
3. 全テストが緑。`ruff check` と `ruff format --check` が通る
4. `claude plugin validate --strict` が、プラグイン・マーケットプレイス・雛形のすべてで通る
5. 契約の複製と正本のずれが、**サーバ単体とテストの両方で**検出される（実際に壊して確認する）
6. サーバ単体で `docker compose up` が通る

## 10. 決めてあること

| 事項 | 決定 |
| --- | --- |
| サーバの Python | 3.9 を維持する。実行基盤の Function Base が `py39` である |
| 統合環境の履歴 | 既存リポジトリを転用する。プラグインの欠陥と修正の記録が残る |
| サーバの履歴 | 引き継がない。大半がプラグインと同じコミットに混ざっており、切り出しても意味を持たない |
| 統合の手段 | submodule。版が固定され、古いサーバと新しいプラグインの組み合わせを防ぐ |
| remote | 当面 GitHub に置く。社内リポジトリへの移行は後日、別の作業環境で行う |
| マニフェストの検証 | `claude plugin validate --strict` に委譲する。自作の検査は上流が見ない項目だけに絞る |
| 検証の送信先 | **本番の受信先に向けない。**配布前のプラグインは送信先が空で、既定ではどこにも送らない |
