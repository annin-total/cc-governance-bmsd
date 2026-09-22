import json, os, sys, datetime

plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
manifest_path = os.path.join(plugin_root, ".claude-plugin", "plugin.json")

try:
    with open(manifest_path) as f:
        manifest = json.load(f)
    version = manifest.get("version", "unknown")
except Exception as e:
    version = f"ERROR:{e}"

out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "captured")
# fallback: write next to the marketplace repo root's sibling "captured" dir via env var if provided
out_dir = os.environ.get("DUMMY_CAPTURE_DIR", out_dir)
os.makedirs(out_dir, exist_ok=True)
ts = datetime.datetime.now().isoformat()
with open(os.path.join(out_dir, "captured.log"), "a") as f:
    f.write(f"{ts} version={version} plugin_root={plugin_root}\n")

sys.exit(0)
