"""UC 24 段階 0・1: 偽の open が効くことを確かめ、session_start.py を直接呼んで判定の分岐を見る。

claude を使わない。plugin/ の複製を一時ディレクトリに置いて呼ぶ（配布物を汚さない）。
使い方: CC_E2E_RUN=a <worktree>/.venv/bin/python direct.py
"""

import json
import os
import shutil
import subprocess
import sys

import uc24_lib as L

RESULTS: list = []


def _check_fake() -> None:
    """段階 0: 本物の open を呼ばない条件で、PATH 解決が偽を指し、偽が記録することを確かめる。"""
    found = shutil.which("open", path=L.fake_path())
    assert found == str(L.FAKEBIN / "open"), found
    code = "import shutil,sys; print(shutil.which('open'))"
    out = subprocess.run(
        [sys.executable, "-c", code], env={**os.environ, "PATH": L.fake_path()},
        capture_output=True, text=True, check=True,
    ).stdout.strip()  # fmt: skip
    assert out == str(L.FAKEBIN / "open"), out
    subprocess.run([str(L.FAKEBIN / "open"), "probe-arg"], check=True)
    assert L.read_lines(L.OPEN_LOG) == ["open\tprobe-arg"], L.read_lines(L.OPEN_LOG)
    L.OPEN_LOG.unlink()
    print("段階0: 偽の open は PATH 解決で選ばれ、引数を記録する")


def _plugin_copy():
    dst = L.BASE / "plugin"
    shutil.copytree(L.WT / "plugin", dst, ignore=shutil.ignore_patterns("__pycache__"))
    (dst / "notices.json").write_bytes(L.notices(with_url=True))
    return dst


def _run(plugin, label: str, entrypoint, readonly: bool = False, runs: int = 1) -> None:
    case = L.BASE / f"case-{label}"
    cfg, data = case / "config", case / "data"
    cfg.mkdir(parents=True)
    data.mkdir()
    if readonly:
        data.chmod(0o555)
    env = {
        "PATH": L.fake_path(), "HOME": os.environ["HOME"], "CLAUDE_CONFIG_DIR": str(cfg),
        "CLAUDE_PLUGIN_DATA": str(data), "CLAUDE_PLUGIN_ROOT": str(plugin),
        "PYTHONDONTWRITEBYTECODE": "1", "TMPDIR": str(case),
    }  # fmt: skip
    if entrypoint is not None:
        env["CLAUDE_CODE_ENTRYPOINT"] = entrypoint
    shown = []
    for _ in range(runs):
        res = subprocess.run(
            ["python3", str(plugin / "hooks" / "session_start.py"), "SessionStart"],
            input="{}", env=env, capture_output=True, text=True, timeout=30,
        )  # fmt: skip
        out = json.loads(res.stdout or "{}")
        shown.append("systemMessage" in out and L.URL in out["systemMessage"])
    seen = data / "seen.json"
    rec = {
        "label": label, "entrypoint": entrypoint, "readonly": readonly,
        "shown_each_run": shown, "seen": json.loads(seen.read_text()) if seen.exists() else None,
        "open_calls": L.read_lines(L.OPEN_LOG),
    }  # fmt: skip
    RESULTS.append(rec)
    print(json.dumps(rec, ensure_ascii=False))
    L.OPEN_LOG.unlink(missing_ok=True)


def main() -> None:
    L.setup_fakes()
    try:
        _check_fake()
        plugin = _plugin_copy()
        # cli は偽の open が呼ばれる陽性対照（検出がゲートすることの確認）
        _run(plugin, "cli", "cli")
        _run(plugin, "sdk-cli", "sdk-cli", runs=2)
        _run(plugin, "sdk-ts", "sdk-ts")
        _run(plugin, "sdk-py", "sdk-py")
        _run(plugin, "claude-vscode", "claude-vscode")
        _run(plugin, "unset", None)
        _run(plugin, "empty", "")
        _run(plugin, "unknown", "foo")
        _run(plugin, "cli-readonly", "cli", readonly=True, runs=3)
        _run(plugin, "cli-twice", "cli", runs=2)
        out = L.WT.parent.parent / (
            "product/cc-governance-bmsd/.local/e2e-load-testing/"
            "uc-24-noninteractive-notices/direct.json"
        )
        out.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=1), encoding="utf-8")
    finally:
        L.cleanup()


if __name__ == "__main__":
    main()
