#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then
  npm install
fi
npm start
