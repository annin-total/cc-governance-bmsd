"""plugin/hooks/_notices.py の _format_message と同じ書式で systemMessage を出す（url の検査は省く）。"""

import json
import sys
from pathlib import Path

_NOTICES = Path(__file__).resolve().parent.parent / "notices.json"


def _format(notices: list) -> str:
    parts = []
    for n in notices:
        body = n.get("body", "")
        if n.get("url"):
            body = f"{body}\n詳細: {n['url']}"
        parts.append(f"{n['title']}\n{body}" if n.get("title") else body)
    return "\n\n".join(parts)


sys.stdin.read()
sys.stdout.write(json.dumps({"systemMessage": _format(json.loads(_NOTICES.read_text("utf-8")))}, ensure_ascii=False) + "\n")
