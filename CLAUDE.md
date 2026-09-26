# CLAUDE.md - cc-governance-bmsd

Claude Code の端末プラグイン（`plugin/`）と集計サーバ（`server/`、submodule）。
両者は契約の正本 `plugin/hooks/contract.py` と標準設定の正本 `plugin/hooks/policy.py` を共有する。

文書はすべて `docs/` にある。どれを読むかは `docs/README.md`、文書を書くときの判断基準と規約は
`docs/CLAUDE.md`。ルートの `README.md` は人向けの入口（概要・実行手順・よく変える設定）だけを持つ。

## Commands

```bash
# プラグインと統合テスト（リポジトリのルートで）
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt  # 初回のみ
.venv/bin/python -m pytest -q                        # -k やファイル指定で絞り込み可
.venv/bin/ruff check . && .venv/bin/ruff format .
.venv/bin/python scripts/sync_contract.py            # contract.py / policy.py を変えたら複製とハッシュを書き出す

# サーバ（server/ で）
python3.9 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt  # 初回のみ。3.9 が無ければ python3 でよい
.venv/bin/python -m pytest -q
.venv/bin/ruff check . && .venv/bin/ruff format .
docker compose up                                    # http://localhost:15000/ 。終了は docker compose down
```

## Coding

- 依頼範囲外の変更はしない。既存の設計思想を尊重し、差分を最小限に保つ
- 端末側は標準ライブラリだけで書く。配布先に `pip install` を求めない
- 破壊的変更を行わない。実施前に承認を求める
- 外部入力はバリデーションし、APIキー等の機密情報は環境変数で管理する
- 変更後は リンター・型チェック・テストを実行し、Fail Fastを徹底する
- 関心を分離する。フォルダ・ファイル・クラス・メソッド・関数は責務で分割する
- コードファイルは200行以内を目安とする
- 未使用コードを放置しない
- 型注釈を付ける。例外を握り潰さない（hook は除く）
- docstring は原則 1 行（多くても 2 行）。自明なら書かない
- コメントは、込み入ったロジックか、コードから読めず失うと事故になる理由にだけ書く。作業の経緯や検証番号（`# K-1` など）を書かない
- 値のハードコードは避けて定数に分離する。ただし過剰にはしない
- 内部関数・内部メソッドは識別子を付与して区別する
- `tests/fixtures/hook_inputs/` を書き換えない。実採取した hook stdin の記録であり、一括置換は改竄になる。
  作り直すときは `scripts/sanitize_fixtures.py` を使う

## Scope

- **機能の追加・変更（増やす）と、リファクタリング・文書の見直し（減らす）を 1 つの作業に混ぜない**
- 作業中に確認した依頼範囲外の課題は直さず、`.claude/templates/issues.md` の形で `.local/<作業名>/issues.md` に記録し、完了報告で移し先を提案する（移したら記録を更新する）
- `.local/` は一時領域。コード・`docs/`・コミット・PR から参照せず、残す事実は `docs/` か PR 本文に書く
- 減らす作業は `.claude/skills/refactor/SKILL.md`、文書・docstring・コメントの見直しは `.claude/skills/revise-docs/SKILL.md` に従う

## Design

- **定義は単一の正本に置く**：契約（収集項目・policy イベントの列・CSV 列などの列と型）は `contract.py`、配る設定値は `policy.py` が正本である。
  どちらも 1 か所にだけ置き、ほかの場所で複製や再定義をしない（サーバの複製は `sync_contract.py` の生成物）
- **収集は最小限にする**：契約が名指ししたものだけを読む。本文（prompt・応答・メッセージ）には触れない
- **hook は利用者の作業を妨げない**：常に exit 0 で終わり、標準エラーにも何も出力しない
- **配布物を汚さない**：`plugin/` はそのまま配布される。テストや生成物を置かない
- **依存と機能を増やさない**：依存の追加は設計判断として扱い、理由を残す。「将来必要かもしれない」を理由に足さない

## Git

- PR の本文は `.github/pull_request_template.md` の見出しとチェック項目を消さず、書き換えずに使う。
  チェックは 1 項目ずつ検証してから付ける（書き方はテンプレートのコメント）
