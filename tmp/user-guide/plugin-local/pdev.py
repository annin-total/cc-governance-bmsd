"""開発中の plugin/ を、隔離した Claude Code で試す（macOS・Windows）。

    pdev.py [claude の引数...]  plugin/ を同期して起動する（初回は擬似マーケットプレイスの登録とインストールも）
    pdev.py clean               隔離環境とそのログイン情報を消す
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
RUN = HERE / "run"
CONFIG = RUN / "config"
MP = RUN / "mp"
MARKETPLACE = "cc-marketplace-governance-bmsd"
PLUGIN = "governance"
INGEST_URL = "http://127.0.0.1:15000/ingest"
INGEST_TOKEN = "dev-token"
# プラグインが settings.json の env で DISABLE_AUTOUPDATER を "0" にする。本体は隔離の外（共有）にあるので、
# それより強い --settings で更新を止める
NO_UPDATE = json.dumps({"env": {"DISABLE_AUTOUPDATER": "1"}})
# Claude Code の中から呼ばれても、親セッションの変数を引き継がない
_PARENT_KEYS = ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SESSION_ID")


def _claude(*args: str) -> int:
    exe = shutil.which("claude")
    if exe is None:
        sys.exit("claude が PATH に無い")
    env = {k: v for k, v in os.environ.items() if k.upper() not in _PARENT_KEYS}
    env["CLAUDE_CONFIG_DIR"] = str(CONFIG)
    return subprocess.run([exe, "--settings", NO_UPDATE, *args], env=env).returncode


def _sync_plugin() -> None:
    dest = MP / "plugins" / PLUGIN
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(REPO / "plugin", dest, ignore=shutil.ignore_patterns("__pycache__", ".DS_Store"))
    src_mp = REPO.parent / "cc-marketplace-governance-bmsd" / ".claude-plugin" / "marketplace.json"
    (MP / ".claude-plugin").mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_mp, MP / ".claude-plugin" / "marketplace.json")
    config_path = dest / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config.update(ingest_url=INGEST_URL, ingest_token=INGEST_TOKEN)
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _install_once() -> None:
    installed = CONFIG / "plugins" / "installed_plugins.json"
    if installed.exists() and f'"{PLUGIN}@{MARKETPLACE}"' in installed.read_text(encoding="utf-8"):
        return
    CONFIG.mkdir(parents=True, exist_ok=True)
    for args in (
        ("plugin", "marketplace", "add", str(MP), "--scope", "user"),
        ("plugin", "install", f"{PLUGIN}@{MARKETPLACE}", "--scope", "user"),
    ):
        if _claude(*args) != 0:
            sys.exit(f"失敗した: claude {' '.join(args)}")


def _clean() -> None:
    shutil.rmtree(RUN, ignore_errors=True)
    print(f"削除した: {RUN}")
    if sys.platform == "darwin":
        # macOS は認証を Keychain に置く。項目名は CLAUDE_CONFIG_DIR の文字列の SHA-256 先頭 8 桁で決まる
        name = "Claude Code-credentials-" + hashlib.sha256(str(CONFIG).encode()).hexdigest()[:8]
        subprocess.run(["security", "delete-generic-password", "-s", name], capture_output=True)
        print(f"削除した（あれば）: Keychain の {name}")


def main() -> None:
    if sys.argv[1:] == ["clean"]:
        _clean()
        return
    _sync_plugin()
    _install_once()
    sys.exit(_claude(*sys.argv[1:]))


if __name__ == "__main__":
    main()
