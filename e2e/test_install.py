"""モジュール 1（導入）: git source の導入・キャッシュの複製・2 段階更新・SessionStart・hook からの更新・uninstall。

すべて認証不要（未ログインの隔離環境）。
"""

import json
import subprocess
import time
from pathlib import Path

from _flow import data_dir, install, install_path, ok, session
from _market import (
    EXCLUDE,
    MARKETPLACE,
    PLUGIN,
    PLUGIN_ID,
    PLUGIN_SRC,
    publish,
    version,
)
from _root import hook_rows

V1, V2 = version(1), version(2)
_PLUGIN_JSON = ".claude-plugin/plugin.json"


def _manifest_version(plugin_dir: Path) -> str:
    return json.loads((plugin_dir / _PLUGIN_JSON).read_text(encoding="utf-8"))[
        "version"
    ]


def _installed(root) -> tuple:
    """list と installed_plugins.json の、このプラグインの記録。"""
    listed = [p for p in root.plugin_list() if p["id"] == PLUGIN_ID]
    recorded = root.json("plugins/installed_plugins.json")["plugins"].get(PLUGIN_ID, [])
    return listed, recorded


def _assert_installed(root, ver: str) -> Path:
    """list・installed_plugins.json・installPath の plugin.json がそろって `ver`。installPath を返す。"""
    listed, recorded = _installed(root)
    assert len(listed) == 1, listed
    assert len(recorded) == 1, recorded
    entries = listed + recorded
    assert {e["version"] for e in entries} == {ver}
    paths = {e["installPath"] for e in entries}
    assert len(paths) == 1, paths
    path = Path(paths.pop())
    assert _manifest_version(path) == ver
    return path


def _files(top: Path) -> dict:
    return {
        p.relative_to(top).as_posix(): p.read_bytes()
        for p in top.rglob("*")
        if p.is_file() and not set(p.relative_to(top).parts) & set(EXCLUDE)
    }


def test_git_sourceで導入できる(root, gitsrv):
    install(root, gitsrv, V1)
    _assert_installed(root, V1)
    known = root.json("plugins/known_marketplaces.json")[MARKETPLACE]
    assert known["source"] == {"source": "git", "url": gitsrv.url(MARKETPLACE)}
    assert any("git-upload-pack" in path for _, path in gitsrv.requests), (
        gitsrv.requests
    )


def test_installPathはキャッシュの複製(root, gitsrv):
    install(root, gitsrv, V1)
    path = _assert_installed(root, V1).resolve()
    assert (root.config / "plugins" / "cache").resolve() in path.parents
    src, got = _files(PLUGIN_SRC), _files(path)
    assert src.keys() == got.keys()
    # plugin.json は版を、config.json は送信先を publish が書き換える
    rewritten = (_PLUGIN_JSON, "config.json")
    assert [rel for rel in src if rel not in rewritten and src[rel] != got[rel]] == []


def test_2段階で更新される(root, gitsrv):
    install(root, gitsrv, V1)
    publish(root, V2)
    ok(root, "plugin", "marketplace", "update", MARKETPLACE)
    _assert_installed(root, V1)
    clone = Path(
        root.json("plugins/known_marketplaces.json")[MARKETPLACE]["installLocation"]
    )
    assert _manifest_version(clone / "plugins" / PLUGIN) == V2
    ok(root, "plugin", "update", PLUGIN_ID)
    _assert_installed(root, V2)


def test_SessionStartがinstallPathから動く(root, gitsrv):
    install(root, gitsrv, V1)
    path = _assert_installed(root, V1)
    session(root)
    rows = hook_rows(data_dir(root))
    assert any(
        r["kind"] == "event" and r["hook_event"] == "SessionStart" for r in rows
    ), rows
    # event 行は版を持たない。版は同じ SessionStart が積む policy 行で確かめる
    assert any(r["kind"] == "policy" and r["plugin_version"] == V1 for r in rows), rows
    assert [r for r in rows if r["kind"] == "error"] == []
    # バイトコードは import した .py の場所に対応して書かれる。どこから動いたかの証拠になる
    assert list(root.pycache_of(path / "hooks").glob("*.pyc")) != []
    assert not root.pycache_of(root.config / "plugins" / "marketplaces").exists()
    assert (root.config / "governance" / "statusline.js").is_file()


def _startup_hook(root) -> None:
    """導入済みの `session_start.py` を対話の `startup` として直接起動する（`claude -p` は非対話で更新しない）。"""
    path = install_path(root)
    env = root.env()
    data = root.config / "plugins" / "data" / f"{PLUGIN}-{MARKETPLACE}"
    env.update(CLAUDE_PLUGIN_ROOT=str(path), CLAUDE_PLUGIN_DATA=str(data))
    res = subprocess.run(
        ["python3", str(path / "hooks" / "session_start.py"), "SessionStart"],
        input=json.dumps({"session_id": "e2e", "source": "startup"}),
        env=env, cwd=root.project, capture_output=True, text=True, timeout=60,
        check=False,
    )  # fmt: skip
    assert (res.returncode, res.stderr) == (0, ""), res


def _wait_version(root, ver: str, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        recorded = root.json("plugins/installed_plugins.json")["plugins"][PLUGIN_ID]
        if [e["version"] for e in recorded] == [ver]:
            return
        time.sleep(1)
    raise AssertionError(f"{timeout} 秒たっても {ver} にならない: {recorded}")


def test_startupのhookが切り離した更新で新版を入れる(root, gitsrv):
    install(root, gitsrv, V1)
    publish(root, V2)
    _startup_hook(root)
    # hook は待たずに戻るので、この時点ではまだ旧版でありうる。子の完了を記録の変化で待つ
    _wait_version(root, V2, timeout=120)
    _assert_installed(root, V2)
    assert (data_dir(root) / "update_at").is_file()
    requests = len(gitsrv.requests)
    # 間隔の内側の startup では起動しない
    _startup_hook(root)
    time.sleep(5)
    assert len(gitsrv.requests) == requests


def test_uninstallでdataが消えgovernanceは残る(root, gitsrv):
    install(root, gitsrv, V1)
    session(root)
    data = data_dir(root)
    statusline = root.config / "governance" / "statusline.js"
    assert data.is_dir() and statusline.is_file()
    ok(root, "plugin", "uninstall", PLUGIN_ID, "--scope", "user")
    assert _installed(root) == ([], [])
    assert not data.exists()
    assert statusline.is_file()
