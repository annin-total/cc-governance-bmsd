# CLAUDE.md - cc-governance-bmsd

Claude Code の端末プラグイン（`plugin/`）と集計サーバ（`server/`、submodule `cc-governance-monitor`）。
両者は契約の正本 `plugin/hooks/contract.py` を共有する。

文書はすべて `docs/` にある。どれを読むかは `docs/README.md`、文書を書くときの判断基準と規約は
`docs/CLAUDE.md`。

## Commands

```bash
# プラグインと統合テスト（リポジトリのルートで）
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt  # 初回のみ
.venv/bin/python -m pytest -q                        # -k やファイル指定で絞り込み可
.venv/bin/ruff check . && .venv/bin/ruff format .
.venv/bin/python scripts/sync_contract.py            # contract.py を変えたら複製とハッシュを書き出す

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
- docstring を 1 行程度で簡潔に書く（自明なら省略してよい）
- 値のハードコードは避けて定数に分離する。ただし過剰にはしない
- 内部関数・内部メソッドは識別子を付与して区別する
- `tests/fixtures/hook_inputs/` を書き換えない。実採取した hook stdin の記録であり、一括置換は改竄になる

## Design

- **契約は単一の正本に置く**：収集項目・ポリシー・CSV 列などの定義は `contract.py` にだけ置き、ほかの場所で複製や再定義をしない
- **収集は最小限にする**：契約が名指ししたものだけを読む。本文（prompt・応答・メッセージ）には触れない
- **hook は利用者の作業を妨げない**：常に exit 0 で終わり、標準エラーにも何も出力しない
- **配布物を汚さない**：`plugin/` はそのまま配布される。テストや生成物を置かない
- **依存と機能を増やさない**：依存の追加は設計判断として扱い、理由を残す。「将来必要かもしれない」を理由に足さない
