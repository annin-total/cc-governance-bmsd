"""SET / ADD / REMOVE の基本動作をデータ駆動で検証する。

1 ケースは (policy, 適用前, 適用後, キーごとの (apply_result, value))。適用後が適用前と
同じケースは、ファイルを書き換えないこと（バイト列が不変）まで確かめる。
settings.json はすべて tmp_path 配下に作る。
"""

import json
from types import SimpleNamespace

import _settings
import pytest

USER = {
    # 利用者の既存設定。どのケースでも、触らないキーはこのまま残ることを確かめる
    "model": "sonnet",
    "env": {"HTTP_PROXY": "http://proxy.example:8080"},
    "permissions": {"allow": ["Bash(ls:*)", "Bash(curl:*)"], "deny": ["Read(./.env)"]},
    "extraKnownMarketplaces": {"mine": {"source": {"source": "github", "repo": "x/y"}}},
}


def _with(**changes) -> dict:
    """USER を深くコピーし、トップレベルのキーを差し替えた dict（値 None はキー削除）。"""
    out = json.loads(json.dumps(USER))
    for key, value in changes.items():
        if value is None:
            out.pop(key)
        else:
            out[key] = value
    return out


_PERM = USER["permissions"]
_MKT = USER["extraKnownMarketplaces"]

CASES = [
    # --- SET ---
    ("SETスカラ", {"SET": {"model": "opus"}}, USER, _with(model="opus"),
     {"model": ("applied", "opus")}),
    ("SET途中のdictを作る", {"SET": {"modelSettings.m.effortLevel": "high"}}, USER,
     _with(modelSettings={"m": {"effortLevel": "high"}}),
     {"modelSettings.m.effortLevel": ("applied", "high")}),
    ("SET既存dictに足す", {"SET": {"env.X": "1"}}, USER,
     _with(env={"HTTP_PROXY": "http://proxy.example:8080", "X": "1"}),
     {"env.X": ("applied", "1")}),
    ("SETのdict値は丸ごと置換", {"SET": {"permissions": {"deny": []}}}, USER,
     _with(permissions={"deny": []}), {"permissions": ("applied", '{"deny": []}')}),
    ("SETのlist値は丸ごと置換", {"SET": {"permissions.allow": ["A"]}}, USER,
     _with(permissions={**_PERM, "allow": ["A"]}),
     {"permissions.allow": ("applied", '["A"]')}),
    ("SETのNoneでキー削除", {"SET": {"model": None}}, USER, _with(model=None),
     {"model": ("applied", None)}),
    ("SETのNoneで無いキーは不変", {"SET": {"apiKeyHelper": None}}, USER, USER,
     {"apiKeyHelper": ("already_ok", None)}),
    ("SETのNoneでJSONのnullも消す", {"SET": {"x": None}}, {"x": None}, {},
     {"x": ("applied", None)}),
    ("SET途中がdictでなければ書かない", {"SET": {"model.x": 1}}, USER, USER,
     {"model.x": ("skipped_missing", "1")}),
    ("マーケットプレイスの項目を作らない",
     {"SET": {"extraKnownMarketplaces.other.autoUpdate": True}}, USER, USER,
     {"extraKnownMarketplaces.other.autoUpdate": ("skipped_missing", "true")}),
    ("extraKnownMarketplacesそのものも作らない",
     {"SET": {"extraKnownMarketplaces.mine.autoUpdate": True}}, {}, {},
     {"extraKnownMarketplaces.mine.autoUpdate": ("skipped_missing", "true")}),
    ("既存のマーケットプレイスには書く",
     {"SET": {"extraKnownMarketplaces.mine.autoUpdate": True}}, USER,
     _with(extraKnownMarketplaces={"mine": {**_MKT["mine"], "autoUpdate": True}}),
     {"extraKnownMarketplaces.mine.autoUpdate": ("applied", "true")}),
    # --- ADD ---
    ("ADD無い要素だけ重複なく足す",
     {"ADD": {"permissions.allow": ["Bash(ls:*)", "Bash(git status)", "Bash(git status)"]}},
     USER, _with(permissions={**_PERM, "allow": [*_PERM["allow"], "Bash(git status)"]}),
     {"add:permissions.allow": ("applied", '["Bash(git status)"]')}),
    ("ADD配列が無ければ作る", {"ADD": {"permissions.ask": ["X"]}}, USER,
     _with(permissions={**_PERM, "ask": ["X"]}),
     {"add:permissions.ask": ("applied", '["X"]')}),
    ("ADD全部あれば不変", {"ADD": {"permissions.deny": ["Read(./.env)"]}}, USER, USER,
     {"add:permissions.deny": ("already_ok", None)}),
    ("ADDのdict要素は等値比較", {"ADD": {"xs": [{"a": 1}, {"a": 2}]}}, {"xs": [{"a": 1}]},
     {"xs": [{"a": 1}, {"a": 2}]}, {"add:xs": ("applied", '[{"a": 2}]')}),
    ("ADDは型まで比較", {"ADD": {"xs": [1]}}, {"xs": [True]}, {"xs": [True, 1]},
     {"add:xs": ("applied", "[1]")}),
    ("ADD配列でなければ書かない", {"ADD": {"model": ["x"]}}, USER, USER,
     {"add:model": ("skipped_missing", None)}),
    # --- REMOVE ---
    ("REMOVEある要素だけ消す",
     {"REMOVE": {"permissions.allow": ["Bash(curl:*)", "Bash(none)"]}}, USER,
     _with(permissions={**_PERM, "allow": ["Bash(ls:*)"]}),
     {"remove:permissions.allow": ("applied", '["Bash(curl:*)"]')}),
    ("REMOVE配列が無ければ不変", {"REMOVE": {"permissions.ask": ["X"]}}, USER, USER,
     {"remove:permissions.ask": ("already_ok", None)}),
    ("REMOVE配列でなければ書かない", {"REMOVE": {"model": ["x"]}}, USER, USER,
     {"remove:model": ("skipped_missing", None)}),
    # --- 組み合わせ ---
    ("同じパスのADDとREMOVEを区別する",
     {"ADD": {"permissions.allow": ["A"]}, "REMOVE": {"permissions.allow": ["Bash(curl:*)"]}},
     USER, _with(permissions={**_PERM, "allow": ["Bash(ls:*)", "A"]}),
     {"add:permissions.allow": ("applied", '["A"]'),
      "remove:permissions.allow": ("applied", '["Bash(curl:*)"]')}),
]  # fmt: skip


def _policy(tables: dict) -> SimpleNamespace:
    return SimpleNamespace(
        **{t: tables.get(t, {}) for t in ("SET", "ADD", "REMOVE", "ONCE")}
    )


def _run(tmp_path, tables: dict, before: dict):
    path = tmp_path / "settings.json"
    if not path.exists():
        path.write_text(json.dumps(before), encoding="utf-8")
    rows = _settings.apply_settings(path, _policy(tables), tmp_path / "governance")
    return path, {key: (result, value) for key, value, _prev, result in rows}


@pytest.mark.parametrize(("tables", "before", "after", "expected"),
                         [c[1:] for c in CASES], ids=[c[0] for c in CASES])  # fmt: skip
def test_操作の結果(tmp_path, tables, before, after, expected):
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(before), encoding="utf-8")
    raw_before = path.read_bytes()

    _path, rows = _run(tmp_path, tables, before)

    assert rows == expected
    assert json.loads(path.read_text(encoding="utf-8")) == after
    if after == before:
        assert path.read_bytes() == raw_before, "差分が無いのに書き換えた"


@pytest.mark.parametrize(("tables", "before"), [c[1:3] for c in CASES],
                         ids=[c[0] for c in CASES])  # fmt: skip
def test_2回目は何も変えない(tmp_path, tables, before):
    """冪等性。2 回目は書き込み対象が無く、ファイルもバックアップも増えない。"""
    path, _ = _run(tmp_path, tables, before)
    raw = path.read_bytes()
    backups = sorted((tmp_path / "governance").glob("backups/*"))

    _path, rows = _run(tmp_path, tables, before)

    assert {r for r, _v in rows.values()} <= {"already_ok", "skipped_missing"}
    assert path.read_bytes() == raw
    assert sorted((tmp_path / "governance").glob("backups/*")) == backups
