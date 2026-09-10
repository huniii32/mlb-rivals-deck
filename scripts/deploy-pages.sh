#!/usr/bin/env bash
# GitHub Pages 배포: 빌드 -> gh-pages 브랜치 푸시
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_BASE=/mlb-rivals-deck/ npm run build
GHDIR=/tmp/opencode/ghp
rm -rf "$GHDIR"
mkdir -p "$GHDIR"
cp -r dist/. "$GHDIR/"
touch "$GHDIR/.nojekyll"
git init -qb gh-pages "$GHDIR" 2>/dev/null || true
git -C "$GHDIR" add -A
git -C "$GHDIR" commit -qm "deploy: $(date +%Y%m%d-%H%M)" || true
git -C "$GHDIR" remote add origin https://github.com/huniii32/mlb-rivals-deck.git 2>/dev/null || true
git -C "$GHDIR" push -f origin gh-pages
echo "live: https://huniii32.github.io/mlb-rivals-deck/"
