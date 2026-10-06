#!/usr/bin/env bash
# Dựng thư mục site/ để deploy (Firebase Hosting hoặc GitHub Pages)
set -euo pipefail
cd "$(dirname "$0")"
rm -rf site && mkdir -p site/icons
cp stone-balance.html site/index.html
cp stone-balance.html auth.html online.js firebase-config.js manifest.webmanifest sw.js site/
cp icons/* site/icons/
echo "site/ sẵn sàng"
