"""UC55-2（UC52）: 版を上げずに中身を変えて publish し直すと端末に届くか。版を上げた場合と対比する。

`CC_E2E_RUN=c` 必須。認証不要。中身の違いは installPath の目印ファイルで見る。
"""

import json  # noqa: I001 (_uc55 が sys.path に e2e/ を足すため先に import する)
import os
import sqlite3
import time
from pathlib import Path

from _uc55 import LOCAL, Terminal
from _flow import ingest_config
from _market import MARKETPLACE, PLUGIN_ID, publish, version
from _server import DockerServer, build_context
from _root import E2ERoot

MARK = "hooks/_uc55_marker.txt"
V, V_NEXT = version(11), version(12)


def _state(t: Terminal, label: str) -> dict:
    rec = t.root.json("plugins/installed_plugins.json")["plugins"][PLUGIN_ID][0]
    path = Path(rec["installPath"])
    clone = Path(
        t.root.json("plugins/known_marketplaces.json")[MARKETPLACE]["installLocation"]
    )
    known = t.root.json("plugins/known_marketplaces.json")[MARKETPLACE]
    s = {
        "step": label, "version": rec.get("version"), "sha": rec.get("gitCommitSha"),
        "installPath": path.name, "marker": (path / MARK).read_text().strip(),
        "clone_marker": (clone / "plugins/governance" / MARK).read_text().strip(),
        "autoUpdate": known.get("autoUpdate"),
        "cache_versions": sorted(p.name for p in path.parent.iterdir()),
    }  # fmt: skip
    print(json.dumps(s, ensure_ascii=False))
    return s


def _cli(t: Terminal, *args: str) -> str:
    res = t.root.run_claude(*args, timeout=120)
    out = (res.stdout + res.stderr).strip()
    print(f"$ claude {' '.join(args)} -> {res.returncode}: {out[:300]}")
    return out


def _flush(t: Terminal) -> None:
    if any((t.root.config / "plugins" / "data").glob("*")):
        (t.data() / "sent_at").unlink(missing_ok=True)
    t.session()
    t.root.wait_quiet()


def main() -> None:
    assert os.environ.get("CC_E2E_RUN") == "c"
    out = LOCAL / f"bump-{int(time.time())}"
    out.mkdir(parents=True)
    sroot = E2ERoot()
    server = DockerServer(sroot, "main")
    t = None
    log = []
    try:
        server.start(build_context(sroot, "main"))
        server.wait_ready()
        cfg = ingest_config(server.port, server.token)
        t = Terminal("bump", V)
        t.install(server, {MARK: b"A\n"})
        _flush(t)
        log.append(_state(t, f"導入 {V}（A）+ 起動"))
        publish(t.root, V, dict(cfg, **{MARK: b"B\n"}))
        _flush(t)
        _flush(t)
        log.append(_state(t, f"同じ版 {V} で B を publish → 起動 ×2"))
        _cli(t, "plugin", "marketplace", "update", MARKETPLACE)
        log.append(_state(t, "marketplace update"))
        log.append({"update_out": _cli(t, "plugin", "update", PLUGIN_ID)})
        log.append(_state(t, "plugin update"))
        _cli(t, "plugin", "uninstall", PLUGIN_ID, "--scope", "user")
        _cli(t, "plugin", "install", PLUGIN_ID, "--scope", "user")
        log.append(_state(t, "uninstall + install（同じ版のまま）"))
        _flush(t)
        publish(t.root, V_NEXT, dict(cfg, **{MARK: b"C\n"}))
        _flush(t)
        _flush(t)
        log.append(_state(t, f"版を {V_NEXT} に上げて C を publish → 起動 ×2"))
        _cli(t, "plugin", "marketplace", "update", MARKETPLACE)
        log.append({"update_out": _cli(t, "plugin", "update", PLUGIN_ID)})
        log.append(_state(t, "marketplace update + plugin update"))
        _flush(t)
        time.sleep(5)
        data = server.copy_data(out / "db")
        with sqlite3.connect(data / "e2e.db") as c:
            vers = c.execute(
                "SELECT plugin_version, COUNT(*) FROM policy_state GROUP BY 1"
            ).fetchall()  # fmt: skip
        print("サーバの policy_state の版:", vers)
        log.append({"server_versions": vers})
        (out / "log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1))
    finally:
        if t:
            t.close()
        server.close()
        sroot.cleanup()


if __name__ == "__main__":
    main()
