"""上流のキーが消えた行を Docker の集計サーバへ送り、概況の健全性（NULL 率の表・分布）がどう見えるかを見る。

行は実採取の fixture（tests/fixtures/hook_inputs/、読むだけ）を本物の collect.extract_event に通して作る。
段階 1: そのまま送る。段階 2: 同じ入力から `tool_name` と `effort` と `session_id` を消して送る。
使い方: CC_E2E_RUN=c .venv/bin/python <このファイル> <出力先>
"""

import json
import os
import re
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "e2e"))
from _root import E2ERoot  # noqa: E402
from _server import BASE_PATH, DockerServer, build_context  # noqa: E402

FIXTURES = REPO / "tests" / "fixtures" / "hook_inputs"
REMOVED = ("tool_name", "effort", "session_id")


def _rows(drop: tuple) -> list:
    os.environ["CLAUDE_PLUGIN_DATA"] = tempfile.mkdtemp(prefix="uc31-data-")
    os.environ["CC_GOVERNANCE_USER_EMAIL"] = "uc31@example.invalid"
    sys.path.insert(0, str(REPO / "plugin" / "hooks"))
    import collect

    rows = []
    for f in sorted(FIXTURES.glob("*.json")):
        raw = json.loads(f.read_text(encoding="utf-8"))
        ev = raw.get("hook_event_name")
        for k in drop:
            raw.pop(k, None)
        rows.append(collect.extract_event(raw, ev))
    return rows


def _post(srv: DockerServer, rows: list) -> dict:
    body = "".join(json.dumps(r) + "\n" for r in rows).encode()
    status, text, _ = srv.request("POST", BASE_PATH + "/ingest", body, {"X-Ingest-Token": srv.token})
    assert status == 200, text
    return json.loads(text)


def _overview(srv: DockerServer, out: Path, tag: str) -> dict:
    status, html, _ = srv.request("GET", srv.admin_path("/"), auth=True)
    assert status == 200, status
    (out / f"overview-{tag}.html").write_text(html, encoding="utf-8")
    null_tbl = re.search(r'data-testid="null-rates".*?</table>', html, re.S).group(0)
    cells = re.findall(r"<td>(\w+)</td>\s*<td>(.*?)</td>", null_tbl, re.S)
    rates = {c: re.sub(r"<[^>]+>|\s+", " ", v).strip() for c, v in cells}
    dist = {}
    for col in ("permission_mode", "effort_level"):
        m = re.search(rf"<h2>{col} の分布</h2>.*?</table>", html, re.S)
        dist[col] = re.findall(r"<tr><td>(.*?)</td><td class=\"num\">(.*?)</td>", m.group(0)) if m else None
    tiles = re.findall(r'class="tile[^"]*".*?</div>\s*</div>', html, re.S)
    return {"null_rates": rates, "distributions": dist, "tiles_text": [re.sub(r"<[^>]+>|\s+", " ", t).strip() for t in tiles][:3]}


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    root = E2ERoot()
    srv = DockerServer(root, "uc31")
    report = {}
    try:
        srv.start(build_context(root, "uc31"))
        srv.wait_ready()
        normal = _rows(())
        report["ingest_1"] = _post(srv, normal)
        report["phase1_normal"] = _overview(srv, out, "1-normal")
        broken = _rows(REMOVED)
        report["ingest_2"] = _post(srv, broken)
        report["phase2_after_removed_keys"] = _overview(srv, out, "2-removed")
        report["rows_per_phase"] = len(normal)
    finally:
        srv.close()
        root.cleanup()
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
