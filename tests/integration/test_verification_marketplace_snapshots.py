"""verification/autoupdate/marketplaces/ のスナップショットが bare の HEAD と一致することを確かめる。

`ruff.toml` は `verification/autoupdate/marketplaces/` を lint 対象から丸ごと除外している。
唯一の根拠は「配下は bare リポジトリの HEAD の木のスナップショットである」ことなので、
それが崩れていないことをここで検査する。bare が1つも見つからない場合は検査対象0件で
緑になる書き方を避け、明示的に落とす。
"""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
MARKETPLACES_DIR = ROOT / "verification" / "autoupdate" / "marketplaces"


def _git(bare_dir: Path, *args: str) -> str:
    r = subprocess.run(
        ["git", "--git-dir", str(bare_dir), *args],
        capture_output=True,
        text=True,
        check=True,
    )
    return r.stdout


def _discover_pairs() -> list[tuple[str, Path, Path]]:
    """`marketplaces/<name>/` ごとに (bare, snapshot) の組を1つ見つける。

    命名規則は「*.git というディレクトリが bare、それ以外のディレクトリがスナップショット」
    だけを前提にし、個別のマーケットプレイス名はハードコードしない。
    """
    pairs = []
    if not MARKETPLACES_DIR.is_dir():
        return pairs
    for group_dir in sorted(MARKETPLACES_DIR.iterdir()):
        if not group_dir.is_dir():
            continue
        bare_dirs = [
            d for d in group_dir.iterdir() if d.is_dir() and d.name.endswith(".git")
        ]
        snapshot_dirs = [
            d for d in group_dir.iterdir() if d.is_dir() and not d.name.endswith(".git")
        ]
        if len(bare_dirs) == 1 and len(snapshot_dirs) == 1:
            pairs.append((group_dir.name, bare_dirs[0], snapshot_dirs[0]))
    return pairs


_PAIRS = _discover_pairs()


def test_marketplace_pairs_were_discovered():
    """bare/スナップショットの組が1つも見つからないと、以降のテストが検査0件で
    黙って緑になってしまう。ここでその事態自体を検出する。"""
    assert _PAIRS, (
        f"{MARKETPLACES_DIR} の下に bare/スナップショットの組が見つからなかった"
        "（検査対象0件のまま緑になることを防ぐための明示的な失敗）"
    )


@pytest.mark.parametrize(
    "group_name, bare_dir, snapshot_dir",
    _PAIRS,
    ids=[name for name, _, _ in _PAIRS],
)
def test_snapshot_matches_bare_head(group_name, bare_dir, snapshot_dir):
    """スナップショットのファイル集合・内容が bare の HEAD の木と一致する。"""
    tracked = sorted(
        line
        for line in _git(bare_dir, "ls-tree", "-r", "--name-only", "HEAD").splitlines()
        if line
    )
    assert tracked, f"{bare_dir} の HEAD にファイルが無い"

    snapshot_files = sorted(
        str(p.relative_to(snapshot_dir)) for p in snapshot_dir.rglob("*") if p.is_file()
    )
    assert snapshot_files == tracked, (
        f"{group_name}: スナップショットのファイル集合が bare の HEAD と一致しない\n"
        f"  bare にしか無い: {sorted(set(tracked) - set(snapshot_files))}\n"
        f"  スナップショットにしか無い: {sorted(set(snapshot_files) - set(tracked))}"
    )

    for rel_path in tracked:
        bare_content = _git(bare_dir, "show", f"HEAD:{rel_path}")
        snapshot_content = (snapshot_dir / rel_path).read_text(encoding="utf-8")
        assert bare_content == snapshot_content, (
            f"{group_name}: {rel_path} がスナップショットと bare の HEAD で一致しない"
        )
