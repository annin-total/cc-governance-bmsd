"""型違いの値で enabled: false になる原因の切り分け（誰が書くか・素の config での振る舞い・戻し方）。

使い方: CC_E2E_RUN=a <worktree>/.venv/bin/python probe2.py [plugin bare]
"""

import hashlib
import json
import shutil
import sys

import run
from run import LOG, V1, Ctx, _put, install, policy_src
from _root import E2ERoot

OUT: dict = {}


def snap(config) -> dict:
    """config 配下のファイルのハッシュ（cache・marketplaces の中身と pycache は除く）。"""
    out = {}
    for p in sorted(config.rglob("*")):
        rel = p.relative_to(config).as_posix()
        if p.is_file() and not rel.startswith(("plugins/cache/", "plugins/marketplaces/")):
            out[rel] = hashlib.sha256(p.read_bytes()).hexdigest()[:12]
    return out


def diff(a: dict, b: dict) -> dict:
    return {k: (a.get(k), b.get(k)) for k in sorted(a.keys() | b.keys()) if a.get(k) != b.get(k)}


def texts(config) -> dict:
    names = ("settings.json", "plugins/installed_plugins.json", "plugins/known_marketplaces.json")
    return {n: (config / n).read_text(encoding="utf-8") if (config / n).is_file() else None for n in names}


def claude_p(root, tag: str) -> dict:
    """`claude -p` を debug 付きで 1 回起動し、init・stderr・debug の設定関連行を返す。"""
    dbg = LOG / f"debug-{tag}.log"
    res = root.run_claude("-p", "ok", "--output-format", "stream-json", "--verbose",
                          "--debug-file", str(dbg), timeout=90)  # fmt: skip
    init = [json.loads(x) for x in res.stdout.splitlines() if '"init"' in x]
    plugins = [p["source"] for p in init[0]["plugins"]] if init else None
    lines = dbg.read_text(encoding="utf-8", errors="replace").splitlines() if dbg.is_file() else []
    hits = [ln[:300] for ln in lines if any(w in ln.lower() for w in ("setting", "invalid", "valid", "schema", "plugin"))]
    return {"rc": res.returncode, "stderr": res.stderr[-500:], "init_plugins": plugins,
            "debug_hits": hits[:40]}  # fmt: skip


def doctor(root) -> str:
    res = root.run_claude("doctor", timeout=60)
    return f"rc={res.returncode}\n{res.stdout[-2500:]}\n--stderr--\n{res.stderr[-800:]}"


def part_plugin() -> None:
    """1・3: 導入済みの端末で型違いを入れ、どのファイルが変わるか・気づき方・戻し方。"""
    c = Ctx("probe2")
    r = OUT["plugin"] = {}
    try:
        install(c.root, c.git, V1, policy_src({run.AC: "60", run.AUTO: True}, {}))
        c.session("s1 素")
        s0, t0 = snap(c.root.config), texts(c.root.config)
        c.edit(lambda d: _put(d, "cleanupPeriodDays", "30"))
        s1, t1 = snap(c.root.config), texts(c.root.config)
        r["edit_diff"] = diff(s0, s1)
        r["claude_p"] = claude_p(c.root, "plugin-bad")
        s2, t2 = snap(c.root.config), texts(c.root.config)
        r["after_claude_p_diff"] = diff(s1, s2)
        r["plugin_list"] = c.root.plugin_list()
        s3, t3 = snap(c.root.config), texts(c.root.config)
        r["after_plugin_list_diff"] = diff(s2, s3)
        r["texts_changed_by_claude"] = {k: (t1[k], t3[k]) for k in t1 if t1[k] != t3[k]}
        r["doctor_bad"] = doctor(c.root)
        r["s_bad_rows"] = len(c.session("s2 型違いのまま"))
        # 戻す: 型だけ直す
        c.edit(lambda d: _put(d, "cleanupPeriodDays", 30))
        r["plugin_list_fixed"] = c.root.plugin_list()
        r["s_fixed_rows"] = len(c.session("s3 cleanupPeriodDays を int に戻した後"))
        # 2 つ目の型違い（env）でも同じか、キーを消して戻るか
        c.edit(lambda d: d.__setitem__("env", "broken"))
        r["plugin_list_env_bad"] = c.root.plugin_list()
        r["s_env_bad_rows"] = len(c.session("s4 env が文字列"))
        c.edit(lambda d: d.pop("env"))
        r["s_env_removed_rows"] = len(c.session("s5 env を消した後"))
        r["env_after"] = c.settings().get("env")
    finally:
        c.close()


def part_bare() -> None:
    """2: プラグインなしの素の config。settings の hook と env が効くかで読み捨ての範囲を見る。"""
    cases = {
        "valid": {"cleanupPeriodDays": 30},
        "cleanup_str": {"cleanupPeriodDays": "30"},
        "env_str": {"env": "broken"},
    }
    OUT["bare"] = {}
    for name, extra in cases.items():
        root = E2ERoot()
        try:
            mark = root.tmp / "hook_ran.txt"
            settings = {
                "env": {"GOV_PROBE_ENV": "from-settings"},
                "hooks": {"SessionStart": [{"hooks": [{"type": "command",
                          "command": f'echo "ran env=$GOV_PROBE_ENV" > "{mark}"'}]}]},  # fmt: skip
            }
            settings.update(extra)
            (root.config / "settings.json").write_text(json.dumps(settings, indent=2), encoding="utf-8")
            before = texts(root.config)["settings.json"]
            res = claude_p(root, f"bare-{name}")
            res["hook_mark"] = mark.read_text().strip() if mark.is_file() else None
            res["settings_unchanged"] = texts(root.config)["settings.json"] == before
            res["doctor"] = doctor(root)
            OUT["bare"][name] = res
            print(f"[bare:{name}] hook={res['hook_mark']} unchanged={res['settings_unchanged']} rc={res['rc']}")
        finally:
            root.cleanup()


def main() -> None:
    parts = {"plugin": part_plugin, "bare": part_bare}
    try:
        for name in sys.argv[1:] or list(parts):
            parts[name]()
    finally:
        (LOG / "probe2.json").write_text(json.dumps(OUT, ensure_ascii=False, indent=2), encoding="utf-8")
        shutil.rmtree(run.BASE, ignore_errors=True)


if __name__ == "__main__":
    main()
