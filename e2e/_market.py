"""開発ツリーの `plugin/` からマーケットプレイスを組み立て、bare リポジトリへ publish する。"""

import json
import shutil
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit

from _root import E2ERoot

REPO = Path(__file__).resolve().parent.parent
PLUGIN_SRC = REPO / "plugin"
# 名前は本物と同じにする。policy.py が名前を名指しして設定を配るため、変えると検証にならない
MARKETPLACE = "cc-marketplace-governance-bmsd"
PLUGIN = "governance"
PLUGIN_ID = f"{PLUGIN}@{MARKETPLACE}"
_PLUGIN_JSON = Path(".claude-plugin") / "plugin.json"
_IGNORE = shutil.ignore_patterns("__pycache__", ".DS_Store")
_LOCAL_HOSTS = ("127.0.0.1", "localhost")
# 開発者の gitconfig（署名・改行変換・既定ブランチ）の影響を消す
_GIT = [
    "git", "-c", "user.name=cc-e2e", "-c", "user.email=e2e@example.invalid",
    "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "init.defaultBranch=main",
]  # fmt: skip


def dev_manifest() -> dict:
    """開発ツリーの plugin.json。"""
    return json.loads((PLUGIN_SRC / _PLUGIN_JSON).read_text(encoding="utf-8"))


def version(n: int) -> str:
    """開発ツリーの版の patch を +n した版。開発ツリーと違う版であること自体が配布物から動いた証拠になる。"""
    major, minor, patch = dev_manifest()["version"].split(".")
    return f"{major}.{minor}.{int(patch) + n}"


def publish(root: E2ERoot, ver: str, overrides: Optional[dict] = None) -> None:
    """組み立てて commit し、`srv/<MARKETPLACE>.git` へ push する。overrides は相対パス→bytes。"""
    mp = root.build / "mp"
    dest = mp / "plugins" / PLUGIN
    if not (mp / ".git").is_dir():
        mp.mkdir()
        _git(root, mp, "init", "-q")
        _git(root, root.srv, "init", "-q", "--bare", f"{MARKETPLACE}.git")
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(PLUGIN_SRC, dest, ignore=_IGNORE)
    for rel, data in (overrides or {}).items():
        (dest / rel).parent.mkdir(parents=True, exist_ok=True)
        (dest / rel).write_bytes(data)
    manifest = json.loads((dest / _PLUGIN_JSON).read_text(encoding="utf-8"))
    manifest["version"] = ver
    _write_json(dest / _PLUGIN_JSON, manifest)
    _write_json(mp / ".claude-plugin" / "marketplace.json", _marketplace_json(manifest))
    _check_ingest_url(dest / "config.json")
    _git(root, mp, "add", "-A")
    _git(root, mp, "commit", "-q", "-m", ver)
    _git(
        root, mp, "push", "-q", "-f", str(root.srv / f"{MARKETPLACE}.git"), "HEAD:main"
    )


def _marketplace_json(manifest: dict) -> dict:
    """配布用マーケットプレイスの marketplace.json と同じ形。"""
    desc = manifest["description"]
    return {
        "name": MARKETPLACE,
        "owner": manifest["author"],
        "description": desc,
        "plugins": [
            {"name": PLUGIN, "source": f"./plugins/{PLUGIN}", "description": desc}
        ],
    }


def _check_ingest_url(path: Path) -> None:
    """送信先が空か localhost でなければ publish しない（前方一致で判定しない）。"""
    url = json.loads(path.read_text(encoding="utf-8")).get("ingest_url", "")
    if url and urlsplit(url).hostname not in _LOCAL_HOSTS:
        raise RuntimeError("組み立てた config.json の ingest_url がローカルでない")


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _git(root: E2ERoot, cwd: Path, *args: str) -> None:
    res = root.run([*_GIT, *args], timeout=60, cwd=cwd)
    if res.returncode != 0:
        raise RuntimeError(f"git {args[0]} が失敗した: {res.stderr}")
