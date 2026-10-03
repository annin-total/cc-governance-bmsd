#!/bin/sh
# 偽の open。引数と時刻を G4D_OPEN_LOG に追記するだけ。本物のブラウザは開かない
printf '%s\t%s\n' "$(date +%s)" "$*" >> "${G4D_OPEN_LOG:-/dev/null}"
exit 0
