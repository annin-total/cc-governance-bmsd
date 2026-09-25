"""実機検証（`pytest e2e`）の共通設定。同時実行の禁止・本物の状態の監視・隔離ルート・git 配信・集計サーバ。"""

import hashlib
import json
import shutil
import sys
from pathlib import Path

import pytest
from _githttp import GitHttpServer
from _market import MARKETPLACE, PLUGIN_ID, PLUGIN_SRC, REPO, STATUSLINE_MARK
from _root import REAL_CONFIG_DIRS, E2ERoot
from _server import LABEL, DockerServer, build_context
from _server import docker as _docker

_E2E_DIR = Path(__file__).resolve().parent
_WATCHED = (
    "settings.json",
    "plugins/installed_plugins.json",
    "plugins/known_marketplaces.json",
)
# hook の状態ディレクトリの代替経路（CLAUDE_PLUGIN_DATA が無いとき HOME の下に書く）
_FALLBACK_STATE = Path.home() / ".claude" / "cc-governance"
# 今回のセッションが作った隔離ルートの名前と git 配信の host:port。本物に現れたら漏れの痕跡
_TRACES: list = []


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


def _digest(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def _has_key(path: Path, key: str, *parents: str) -> bool:
    data = json.loads(_read(path) or "{}")
    for name in parents:
        data = data.get(name, {})
    return key in data


def _snapshot() -> dict:
    """本物の config での導入の有無と、`plugin/` 木（`__pycache__` の生成を含む）のハッシュ。

    本物の config の値は比べない。並行する本物の Claude Code が正当に書き換えるため。
    """
    snap: dict = {"fallback_state": _FALLBACK_STATE.exists()}
    for d in REAL_CONFIG_DIRS:
        plugins = d / "plugins"
        snap[f"{d}:plugin"] = _has_key(
            plugins / "installed_plugins.json", PLUGIN_ID, "plugins"
        )
        snap[f"{d}:marketplace"] = _has_key(
            plugins / "known_marketplaces.json", MARKETPLACE
        )
    for p in PLUGIN_SRC.rglob("*"):
        # Finder が書き換える。配布物にも含めない（_market.EXCLUDE）
        if p.name != ".DS_Store":
            snap[str(p)] = _digest(p) or "dir"
    return snap


def _leaks() -> list:
    """本物の config に残った、今回の隔離ルート・git 配信・statusline の目印。"""
    found = []
    for d in REAL_CONFIG_DIRS:
        for rel in _WATCHED:
            text = _read(d / rel)
            found += [f"{d / rel}: {t}" for t in _TRACES if t in text]
        statusline = d / "governance" / "statusline.js"
        if STATUSLINE_MARK in _read(statusline):
            found.append(str(statusline))
    return found


@pytest.fixture(scope="session", autouse=True)
def _real_state_unchanged():
    """開始時と終了時で本物の状態が違う、または痕跡が残れば、セッションを失敗させる。"""
    before = _snapshot()
    yield
    after = _snapshot()
    changed = sorted(
        k for k in before.keys() | after.keys() if before.get(k) != after.get(k)
    )
    assert not changed, f"本物の状態が変わった: {changed}"
    leaks = _leaks()
    assert not leaks, f"本物の config に隔離環境の痕跡がある: {leaks}"


@pytest.fixture
def root():
    """1 テスト = 1 隔離ルート。"""
    r = E2ERoot()
    _TRACES.append(r.path.name)
    yield r
    r.cleanup()


@pytest.fixture
def gitsrv(root):
    """`root/srv` を smart HTTP で配る。"""
    server = GitHttpServer(root.srv)
    _TRACES.append(f"127.0.0.1:{server.port}")
    yield server
    server.close()


@pytest.fixture(scope="session")
def docker_ok():
    """docker が無い・デーモンに繋がらなければ skip。前回の片付け漏れ（ラベル付きの資源）があれば失敗。"""
    if (
        shutil.which("docker") is None
        or _docker("info", timeout=30, check=False).returncode
    ):
        pytest.skip("docker が無い、またはデーモンに繋がらない")
    queries = (
        ("ps", "-a", "{{.ID}} {{.Names}}"),
        ("images", "{{.ID}} {{.Repository}}"),
    )
    left = "".join(
        _docker(*q[:-1], "--filter", f"label={LABEL}", "--format", q[-1]).stdout
        for q in queries
    )
    if left:
        pytest.fail(
            f"前回の片付け漏れがある（自動では消さない）:\n{left}"
            f"docker rm -f $(docker ps -aq --filter label={LABEL}); "
            f"docker image rm $(docker images -q --filter label={LABEL})"
        )


@pytest.fixture(scope="session")
def server(docker_ok):
    """Docker で起動した集計サーバ（セッションで 1 つ。ビルドと起動が遅いため共有する）。

    共有 DB なので、判定は自分が入れたデータ（自分の event_id 等）だけから導く。
    """
    r = E2ERoot()
    _TRACES.append(r.path.name)
    srv = DockerServer(r, "main")
    try:
        srv.start(build_context(r, "main"))
        srv.wait_ready()
        yield srv
    finally:
        srv.close()
        r.cleanup()
