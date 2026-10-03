#!/bin/zsh
# usage: cap.sh <tmux session> <name>   capture-pane の -p（テキスト）と -e（色つき）を $S/cap/<name>.{txt,ansi} に残し、テキストを表示する
S=/private/tmp/claude-501/-Users-terasawayuki-Documents-program-Development-bmsd-governance/f992ce3b-129e-420b-8958-71bb1bc1dc77/scratchpad/g4d
mkdir -p $S/cap
tmux -L gov4d capture-pane -p -t $1 > $S/cap/$2.txt
tmux -L gov4d capture-pane -p -e -t $1 > $S/cap/$2.ansi
command cat $S/cap/$2.txt
