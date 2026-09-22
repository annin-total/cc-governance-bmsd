"""SessionStart hook: 自分の plugin.json の version を $HOME/captured.log に追記する."""
import json, os, datetime, sys

root = os.environ.get("CLAUDE_PLUGIN_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    version = json.load(open(os.path.join(root, ".claude-plugin", "plugin.json")))["version"]
except Exception as e:
    version = f"ERROR:{e}"
home = os.environ.get("HOME", "/tmp")
with open(os.path.join(home, "captured.log"), "a") as f:
    f.write(f"{datetime.datetime.now().isoformat()} version={version} root={root}\n")
sys.exit(0)
