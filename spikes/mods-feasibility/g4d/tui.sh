#!/bin/zsh
# usage: G4D_MODE=<modes> [G4D_NOCMP=1] tui.sh <tag>   tmux -L gov4d の中で対話起動する。作業ディレクトリは $S/ws
source ${0:A:h}/env.sh
tag=$1
dirs=(--plugin-dir $G/g4d-ui)
[[ -z ${G4D_NOCMP:-} ]] && dirs+=(--plugin-dir $G/g4d-cmp)
cd $S/ws
exec $CLEAN G4D_MODE=${G4D_MODE:-} claude $dirs --settings ${G4D_SETTINGS:-$G/settings.json} --debug-file $S/logs/$tag.debug.log
