#!/bin/zsh
# usage: G4D_MODE=<modes> run.sh <tag> <claude args...>   非対話。stdout・stderr・debug を $S/logs/<tag>.* に残す
source ${0:A:h}/env.sh
tag=$1; shift
cd $S/ws
$CLEAN G4D_MODE=${G4D_MODE:-} claude --plugin-dir $G/g4d-ui --plugin-dir $G/g4d-cmp --settings ${G4D_SETTINGS:-$G/settings.json} \
  --debug-file $S/logs/$tag.debug.log "$@" > $S/logs/$tag.out 2> $S/logs/$tag.err
echo "rc=$?"
