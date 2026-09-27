"""UC55 の一時スクリプトが共有する部品（e2e/ の部品を import して再利用する）。"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "e2e"))

from _flow import data_dir, ingest_config, install, install_path, session
from _githttp import GitHttpServer
from _market import PLUGIN_SRC
from _root import E2ERoot, hook_rows

LOCAL = Path(
    "/Users/terasawayuki/Documents/program/Development/bmsd-governance/product/"
    "cc-governance-bmsd/.local/e2e-load-testing/uc-55-mixed-versions"
)
MAX_CLAUDE = 3
_CONTRACT = "hooks/contract.py"


def _replace_once(text: str, old: str, new: str) -> str:
    assert old in text, old
    return text.replace(old, new, 1)


def contract_variant(kind: str) -> bytes:
    """旧版の端末の contract.py（開発ツリーは書き換えない）。"""
    src = (PLUGIN_SRC / _CONTRACT).read_text(encoding="utf-8")
    if kind == "minus1":
        out = _replace_once(
            src, '    ("permission_mode", ("permission_mode",), "VARCHAR(255)"),\n', ""
        )
    elif kind == "plus1":
        line = '    ("session_id", ("session_id",), "VARCHAR(255)"),  # 全 hook\n'
        extra = '    ("hook_event_name_x", ("hook_event_name",), "VARCHAR(64)"),\n'
        out = _replace_once(src, line, line + extra)
    elif kind == "renamed":
        out = _replace_once(
            src, '("tool_name", ("tool_name",)', '("tool", ("tool_name",)'
        )
    elif kind == "ts_renamed":
        # 最初の出現は EXTRA_COLUMNS（policy・error の ts は変えない）
        out = _replace_once(src, '("ts", "INTEGER")', '("timestamp", "INTEGER")')
    else:
        raise ValueError(kind)
    return out.encode()


class Terminal:
    """1 端末 = 1 隔離ルート + 1 git 配信。"""

    def __init__(self, name: str, ver: str) -> None:
        self.name, self.ver = name, ver
        self.root = E2ERoot()
        self.gitsrv = GitHttpServer(self.root.srv)

    def install(self, server, extra: dict) -> None:
        overrides = dict(ingest_config(server.port, server.token), **extra)
        install(self.root, self.gitsrv, self.ver, overrides)

    def session(self) -> list:
        return session(self.root)

    def ask(self, prompt: str) -> dict:
        """認証付き `-p`（haiku・Read だけ許可）。結果の JSON を返す。"""
        res = self.root.run_claude(
            "-p", prompt, "--model", "haiku", "--allowedTools", "Read",
            "--output-format", "json", timeout=300, auth=True,
        )  # fmt: skip
        assert res.returncode == 0, res.stderr[-1000:]
        return json.loads(res.stdout)

    def rows(self) -> list:
        return hook_rows(data_dir(self.root))

    def data(self) -> Path:
        return data_dir(self.root)

    def install_path(self) -> Path:
        return install_path(self.root)

    def close(self) -> None:
        self.gitsrv.close()
        self.root.cleanup()


def parallel(fn, items: list) -> list:
    """同時に動かす claude を MAX_CLAUDE までに抑えて並行実行する。"""
    with ThreadPoolExecutor(max_workers=MAX_CLAUDE) as ex:
        return list(ex.map(fn, items))
