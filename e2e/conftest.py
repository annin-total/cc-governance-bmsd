"""実機検証（`pytest e2e`）の共通設定。同時実行の禁止・本物の状態の監視・隔離ルートと git 配信。"""

import hashlib
import sys
from pathlib import Path

import pytest
from _githttp import GitHttpServer
from _market import PLUGIN_SRC, REPO
from _root import REAL_CONFIG_DIRS, E2ERoot, auth_env

_E2E_DIR = Path(__file__).resolve().parent
_WATCHED = (
    "settings.json",
    "plugins/installed_plugins.json",
    "plugins/known_marketplaces.json",
)


def pytest_configure(config) -> None:
    config.addinivalue_line(
        "markers", "requires_auth: 認証が要る。認証変数が無ければ skip"
    )


def pytest_collection_modifyitems(config, items) -> None:
    """tests/ と同時に動かさない。tests/conftest は import 時に HOME を差し替え、隔離の前提を崩す。"""
    outside = [i.nodeid for i in items if _E2E_DIR not in Path(str(i.fspath)).parents]
    tests_conftest = REPO / "tests" / "conftest.py"
    imported = any(
        getattr(m, "__file__", None) == str(tests_conftest)
        for m in sys.modules.values()
    )
    if outside or imported:
        pytest.exit(
            "e2e は tests と同時に実行しない（pytest e2e で単独実行する）",
            returncode=4,
        )


def pytest_runtest_setup(item) -> None:
    if item.get_closest_marker("requires_auth") and not auth_env():
        pytest.skip("認証変数が無い")


def _digest(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def _snapshot() -> dict:
    """本物の config の監視対象と、`plugin/` 木（`__pycache__` の生成を含む）のハッシュ。"""
    snap = {
        str(d / rel): _digest(d / rel) for d in REAL_CONFIG_DIRS for rel in _WATCHED
    }
    for p in PLUGIN_SRC.rglob("*"):
        snap[str(p)] = _digest(p) or "dir"
    return snap


@pytest.fixture(scope="session", autouse=True)
def _real_state_unchanged():
    """開始時と終了時で本物の状態が違えば、セッションを失敗させる。"""
    before = _snapshot()
    yield
    after = _snapshot()
    changed = sorted(
        k for k in before.keys() | after.keys() if before.get(k) != after.get(k)
    )
    assert not changed, f"本物の状態が変わった: {changed}"


@pytest.fixture
def root():
    """1 テスト = 1 隔離ルート。"""
    r = E2ERoot()
    yield r
    r.cleanup()


@pytest.fixture
def gitsrv(root):
    """`root/srv` を smart HTTP で配る。"""
    server = GitHttpServer(root.srv)
    yield server
    server.close()
