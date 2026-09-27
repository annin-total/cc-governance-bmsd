"""UC55-1: 旧版（契約を変えた組み立て）と新版の端末を同時に同じサーバへ送らせ、DB と概況を取り出す。

`CC_E2E_RUN=c` 必須。`--auth` で認証ありのツール使用セッションを足す（費用がかかる）。
出力は LOCAL/mixed/ に置く（DB・端末ごとの行・概況の HTML）。
"""

import argparse  # noqa: I001 (_uc55 が sys.path に e2e/ を足すため先に import する)
import json
import os
import re
import time

from _uc55 import LOCAL, Terminal, contract_variant, parallel
from _market import version
from _server import DockerServer, build_context
from _root import E2ERoot

# (名前, 版の +n, 契約の変種)。新版は最も高い版にする
TERMINALS = [
    ("minus1", 1, "minus1"),
    ("plus1", 2, "plus1"),
    ("renamed", 3, "renamed"),
    ("ts_renamed", 4, "ts_renamed"),
    ("new", 5, None),
]
AUTH_PLAN = ["new", "minus1", "renamed", "new", "plus1", "renamed"]
PROMPT = (
    "Use the Read tool to read a.txt, then read b.txt, then reply with the two words"
    " you found, separated by a space. Do nothing else."
)
_SETTLE_SEC = 15
DATA_NAME = "governance-cc-marketplace-governance-bmsd"


def _table(body: str, testid: str) -> str:
    m = re.search(rf'data-testid="{testid}".*?</table>', body, re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", m.group(0)) if m else "(無い)"
    return re.sub(r"\s+", " ", text)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--auth", action="store_true")
    args = ap.parse_args()
    assert os.environ.get("CC_E2E_RUN") == "c"
    out = LOCAL / f"mixed-{'auth' if args.auth else 'noauth'}-{int(time.time())}"
    out.mkdir(parents=True, exist_ok=False)
    sroot = E2ERoot()
    server = DockerServer(sroot, "main")
    terms: dict = {}
    try:
        server.start(build_context(sroot, "main"))
        server.wait_ready()
        for name, n, kind in TERMINALS:
            t = Terminal(name, version(n))
            extra = {"hooks/contract.py": contract_variant(kind)} if kind else {}
            t.install(server, extra)
            (t.root.project / "a.txt").write_text("apple\n")
            (t.root.project / "b.txt").write_text("banana\n")
            # 最初の SessionStart で送らせず、全行をためてから同時に送らせる（送った行を漏れなく控えるため）
            state = t.root.config / "plugins" / "data" / DATA_NAME
            state.mkdir(parents=True, exist_ok=True)
            (state / "sent_at").touch()
            terms[name] = t
        t0 = time.time()
        # 未ログインの SessionStart を全端末で同時に（最初の SessionStart は即送信）
        parallel(lambda t: t.session(), list(terms.values()))
        print(f"未ログインのセッション: {time.time() - t0:.1f}s")
        costs = []
        if args.auth:
            res = parallel(lambda n: terms[n].ask(PROMPT), AUTH_PLAN)
            costs = [(n, r.get("total_cost_usd"), r.get("num_turns"), r.get("result"))
                     for n, r in zip(AUTH_PLAN, res)]  # fmt: skip
            print("認証ありのセッション:", costs)
        for t in terms.values():
            t.root.wait_quiet()
        sent = {}
        for name, t in terms.items():
            sent[name] = t.rows()
            (t.data() / "sent_at").unlink()
        # 送信を起こすための未ログインのセッション（同時）
        parallel(lambda t: t.session(), list(terms.values()))
        for t in terms.values():
            t.root.wait_quiet()
        time.sleep(_SETTLE_SEC)
        ids = server.event_ids()
        summary = {}
        for name, t in terms.items():
            mine = {r["event_id"] for r in sent[name]}
            spool = sorted(p.name for p in (t.data() / "spool").glob("*.jsonl"))
            errs = [r for r in t.rows() if r["kind"] == "error"]
            summary[name] = {
                "ver": t.ver, "sent": len(mine), "arrived": len(mine & ids),
                "spool_left": spool, "local_errors_after": errs,
            }  # fmt: skip
        print(json.dumps(summary, ensure_ascii=False, indent=1))
        (out / "sent_rows.json").write_text(json.dumps(sent, ensure_ascii=False))
        (out / "summary.json").write_text(
            json.dumps(
                {"summary": summary, "costs": costs}, ensure_ascii=False, indent=1
            )
        )
        server.copy_data(out / "db")
        _, body, _ = server.request("GET", server.admin_path("/"), auth=True)
        (out / "overview.html").write_text(body)
        for tid in ("null-rates", "plugin-version-distribution", "error-summary"):
            print(tid, ":", _table(body, tid))
    finally:
        for t in terms.values():
            t.close()
        server.close()
        sroot.cleanup()


if __name__ == "__main__":
    main()
