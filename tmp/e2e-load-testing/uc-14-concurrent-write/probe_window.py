"""mtime の検査（_settings.py の _write）から os.replace までの窓に入った他者の書き込みが消えるかを、直接呼び出しで確かめる。"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "plugin" / "hooks"))
import _govdir  # noqa: E402
import _settings  # noqa: E402

d = Path(tempfile.mkdtemp(prefix="cc-e2e-a-14-window-"))
try:
    s = d / "settings.json"
    s.write_text(json.dumps({"theme": "dark"}))
    real_backup = _govdir.backup

    def _backup_with_user_edit(settings, gov):
        # 他のセッション（または利用者・本体）が、検査の直後にこのファイルを書き換えた状況
        settings.write_text(json.dumps({"theme": "dark", "user_edit": "added-in-window"}))
        return real_backup(settings, gov)

    _govdir.backup = _backup_with_user_edit
    policy = type("P", (), {"SET": {"env.X": "1"}, "ADD": {}, "REMOVE": {}, "ONCE": {}})
    rows = _settings.apply_settings(s, policy, d / "governance")
    after = json.loads(s.read_text())
    print("rows:", rows)
    print("after:", after)
    print("窓の書き込みが消えた" if "user_edit" not in after else "窓の書き込みは残った")
finally:
    shutil.rmtree(d)
