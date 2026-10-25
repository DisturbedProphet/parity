#!/bin/sh
# Rebuild the site for paritytimer.com and push it.
# site/ is its own git repo whose main branch GitHub Pages serves; the CNAME
# file in it tells GitHub Pages to serve the site on the custom domain.
set -e
cd "$(dirname "$0")/.."
SITE_URL=https://paritytimer.com sh tools/build.sh
cd site
git add -A
if git diff --cached --quiet; then echo "Nothing changed, nothing to publish."; exit 0; fi
git commit -q -m "${1:-Update Parity}

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q origin main
echo "Pushed. GitHub Pages usually updates within a couple of minutes."
