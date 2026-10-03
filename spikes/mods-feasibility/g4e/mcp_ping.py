"""検証用の最小 MCP サーバ（stdio、改行区切りの JSON-RPC）。ツール ping だけを持つ。"""

import json
import sys

_TOOL = {"name": "ping", "description": "Returns pong.", "inputSchema": {"type": "object", "properties": {}}}


def _reply(req_id: object, result: dict) -> None:
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "result": result}) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        msg = json.loads(line)
        method, req_id = msg.get("method"), msg.get("id")
        if req_id is None:
            continue
        if method == "initialize":
            _reply(req_id, {"protocolVersion": msg["params"].get("protocolVersion", "2025-06-18"),
                            "capabilities": {"tools": {}}, "serverInfo": {"name": "feasmcp", "version": "0.1.0"}})
        elif method == "tools/list":
            _reply(req_id, {"tools": [_TOOL]})
        elif method == "tools/call":
            _reply(req_id, {"content": [{"type": "text", "text": "pong"}]})
        else:
            _reply(req_id, {})


main()
