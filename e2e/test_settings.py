"""モジュール 2（設定の配布）: installPath の policy.py が隔離した settings.json に当たり、本体と共存する。

判定の期待値は組み立てたコピー（installPath）の policy.py から導く。すべて認証不要。
"""

import json
import runpy

from _flow import data_dir, install, install_path, ok, session
from _market import (
    MARKETPLACE,
    PLUGIN_ID,
    PLUGIN_SRC,
    STATUSLINE_MARK,
    publish,
    version,
)
from _root import hook_rows

V1, V2 = version(1), version(2)
_STATUSLINE = "statusline/statusline.js"
_AUTO_UPDATE = f"extraKnownMarketplaces.{MARKETPLACE}.autoUpdate"
_MISSING = object()
_USER_RULE, _R1, _R2 = "Bash(cc-e2e-user:*)", "Read(./cc-e2e-r1)", "Read(./cc-e2e-r2)"


def _policy(root) -> dict:
    """installPath の policy.py の表。

    開発ツリーを import すると `__pycache__` が生え conftest の監視が落ちる。run_path は書かない。
    """
    return runpy.run_path(str(install_path(root) / "hooks" / "policy.py"))


def _dig(data: dict, path: str):
    """`.` 区切りのパスの値。無ければ `_MISSING`（JSON の null と区別する）。"""
    for name in path.split("."):
        if not isinstance(data, dict) or name not in data:
            return _MISSING
        data = data[name]
    return data


def _assert_holds(data: dict, pol: dict) -> None:
    """settings.json の中身が policy の SET・ADD・REMOVE を満たす（SET の None はキーが無い）。"""
    expected = {k: _MISSING if v is None else v for k, v in pol["SET"].items()}
    assert {k: _dig(data, k) for k in expected} == expected, data
    for path, items in pol["ADD"].items():
        assert all(item in _dig(data, path) for item in items), data
    for path, items in pol["REMOVE"].items():
        current = _dig(data, path)
        assert current is _MISSING or not any(i in current for i in items), data


def _assert_second_is_noop(root, first: dict) -> None:
    """2 回目のセッションは 1 回目と同じ組をすべて already_ok で記録する。"""
    session(root)
    second = [r for k, r in _policy_rows(root).items() if k not in first]
    assert sorted(r["key_name"] for r in second) == sorted(
        r["key_name"] for r in first.values()
    )
    assert {r["apply_result"] for r in second} == {"already_ok"}


def _leaves(data: dict, prefix: str = "") -> dict:
    """入れ子の dict を `.` 区切りのパス→値に平らにする。"""
    out = {}
    for k, v in data.items():
        path = f"{prefix}{k}"
        out.update(_leaves(v, path + ".") if isinstance(v, dict) and v else {path: v})
    return out


def _policy_rows(root) -> dict:
    """event_id → policy 行。"""
    rows = hook_rows(data_dir(root))
    return {r["event_id"]: r for r in rows if r["kind"] == "policy"}


def test_SETが入り本体の書き込みも残る(root, gitsrv):
    install(root, gitsrv, V1)
    before_bytes = (root.config / "settings.json").read_bytes()
    before = _leaves(json.loads(before_bytes))
    # 本体（marketplace add・install）の書き込みが在ることを先に確かめる
    assert f"extraKnownMarketplaces.{MARKETPLACE}.source.url" in before, before
    assert before.get(f"enabledPlugins.{PLUGIN_ID}") is True, before
    session(root)
    after = root.json("settings.json")
    pol = _policy(root)
    expected = pol["SET"]
    assert expected
    _assert_holds(after, pol)
    kept = {k: v for k, v in before.items() if k not in expected}
    assert {k: _leaves(after).get(k) for k in kept} == kept
    # hook が実際に書いたことの唯一の証拠（値の一致だけなら本体が書いた可能性を消せない）
    backups = list((root.config / "governance" / "backups").iterdir())
    assert [b.read_bytes() for b in backups] == [before_bytes]


def test_2回目は適用済みで本体に取り込まれる(root, gitsrv):
    install(root, gitsrv, V1)
    pol = _policy(root)
    # 上流が既定で有効にしたら、取り込みの判定が空振りする
    known = root.json("plugins/known_marketplaces.json")[MARKETPLACE]
    assert "autoUpdate" not in known, known
    session(root)
    first = _policy_rows(root)
    assert first
    _assert_holds(root.json("settings.json"), pol)
    _assert_second_is_noop(root, first)
    # autoUpdate は settings.json が権威で、セッション開始時に本体の記録へ同期される
    known = root.json("plugins/known_marketplaces.json")[MARKETPLACE]
    assert known.get("autoUpdate") == pol["SET"][_AUTO_UPDATE]


def _revoke_policy() -> bytes:
    """既存の値を SET の None と REMOVE で撤回し、ADD で 1 つ足す policy.py。"""
    return (
        "SET = {'env.CC_E2E_REVOKE': None}\n"
        f"ADD = {{'permissions.deny': [{_R2!r}]}}\n"
        f"REMOVE = {{'permissions.deny': [{_R1!r}]}}\n"
        "ONCE = {}\n"
    ).encode()


def test_既存の値をSETのNoneとREMOVEで撤回する(root, gitsrv):
    """利用者の値（兄弟キー・利用者の要素）は残り、配った値だけ（重複も含め）消える。"""
    install(root, gitsrv, V1, {"hooks/policy.py": _revoke_policy()})
    path = root.config / "settings.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["env"] = {"CC_E2E_REVOKE": "1", "CC_E2E_USER": "keep"}
    data["permissions"] = {"deny": [_USER_RULE, _R1, _R1]}
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    session(root)
    after = root.json("settings.json")
    _assert_holds(after, _policy(root))
    assert after["env"] == {"CC_E2E_USER": "keep"}
    assert after["permissions"] == {"deny": [_USER_RULE, _R2]}
    first = _policy_rows(root)
    assert {r["apply_result"] for r in first.values()} == {"applied"}
    _assert_second_is_noop(root, first)


def _marked_statusline(tag: str) -> dict:
    """開発ツリーの statusline.js に目印を足した上書き（配置元を取り違えないため）。"""
    src = (PLUGIN_SRC / _STATUSLINE).read_bytes()
    return {_STATUSLINE: src + f"\n{STATUSLINE_MARK}{tag}\n".encode()}


def _assert_statusline(root, tag: str) -> None:
    """governance の statusline.js が、目印 `tag` を持つ installPath の複製とバイト一致する。"""
    shipped = (install_path(root) / _STATUSLINE).read_bytes()
    assert f"{STATUSLINE_MARK}{tag}\n".encode() in shipped
    assert (root.config / "governance" / "statusline.js").read_bytes() == shipped


def test_statuslineはinstallPathの複製で更新に追従する(root, gitsrv):
    install(root, gitsrv, V1, _marked_statusline(V1))
    session(root)
    _assert_statusline(root, V1)
    publish(root, V2, _marked_statusline(V2))
    ok(root, "plugin", "marketplace", "update", MARKETPLACE)
    ok(root, "plugin", "update", PLUGIN_ID)
    session(root)
    _assert_statusline(root, V2)
