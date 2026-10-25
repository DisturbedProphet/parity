#!/bin/sh
# Rebuild the site for its GitHub Pages address and push it.
# site/ is its own git repo whose main branch GitHub Pages serves.
set -e
cd "$(dirname "$0")/.."
SITE_URL=https://disturbedprophet.github.io/parity sh tools/build.sh
cd site
git add -A
if git diff --cached --quiet; then echo "Nothing changed, nothing to publish."; exit 0; fi
git commit -q -m "${1:-Update Parity}

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q origin main
echo "Pushed. GitHub Pages usually updates within a couple of minutes."
