#!/bin/zsh
# home-a / home-b の隔離 HOME を覗き、自動更新がどこまで進んだかを一覧表示する
# （マーケットプレイス HEAD・plugin.json のバージョン・installed_plugins.json・キャッシュ・captured.log）。
W="$(cd "$(dirname "$0")" && pwd)"
for n in a b; do
  H=$W/home-$n
  echo "--- home-$n ---"
  echo "  marketplace HEAD      : $(git -C $H/.claude/plugins/marketplaces/au-verify rev-parse --short HEAD 2>&1)"
  echo "  marketplace version   : $(python3 -c "import json;print(json.load(open('$H/.claude/plugins/marketplaces/au-verify/plugins/dummy/.claude-plugin/plugin.json'))['version'])" 2>&1)"
  echo "  known_mp lastUpdated  : $(python3 -c "import json;print(json.load(open('$H/.claude/plugins/known_marketplaces.json'))['au-verify'].get('lastUpdated'))" 2>&1)"
  echo "  known_mp autoUpdate   : $(python3 -c "import json;print(json.load(open('$H/.claude/plugins/known_marketplaces.json'))['au-verify'].get('autoUpdate','(キーなし)'))" 2>&1)"
  echo "  settings autoUpdate   : $(python3 -c "import json;print(json.load(open('$H/.claude/settings.json'))['extraKnownMarketplaces']['au-verify'].get('autoUpdate','(キーなし)'))" 2>&1)"
  echo "  installed_plugins     : $(python3 -c "import json;d=json.load(open('$H/.claude/plugins/installed_plugins.json'));print([(e['version'],e.get('gitCommitSha','')[:7]) for e in d['plugins']['audummy@au-verify']])" 2>&1)"
  echo "  cache dirs            : $(ls $H/.claude/plugins/cache/au-verify/audummy 2>&1 | tr '\n' ' ')"
  echo "  captured.log          :"; sed 's/^/    /' $H/captured.log 2>/dev/null || echo "    (なし)"
done
