#!/bin/sh
# Assemble the page.
#   parity.html  the claude.ai Artifact (the host adds the document skeleton)
#   site/        the standalone website, ready to upload to any static host
# Set SITE_URL to the address the site will live at, so the canonical link,
# social cards, sitemap and robots.txt use absolute URLs:
#   SITE_URL=https://parity.example.com sh tools/build.sh
set -e
cd "$(dirname "$0")/.."
SITE_URL="${SITE_URL%/}"
IMPORTMAP='<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>'

# Replace __SITE_URL__, or drop lines that need it when no address is set.
urls() { if [ -n "$SITE_URL" ]; then sed "s#__SITE_URL__#$SITE_URL#g"; else grep -v "__SITE_URL__" || true; fi; }

styles() { printf '<style>\n'; cat src/styles.css; printf '</style>\n'; printf '%s\n' "$IMPORTMAP"; }
body_part() {
  cat src/body.html
  printf '<script type="module">\n'
  for f in src/js/*.js; do printf '\n/* ---- %s ---- */\n' "$(basename "$f")"; cat "$f"; done
  printf '</script>\n'
}

{ cat src/head.html; styles; body_part; } > parity.html

mkdir -p site
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  urls < src/head-site.html
  styles
  printf '</head>\n<body>\n'
  body_part
  printf '</body>\n</html>\n'
} > site/index.html
cp src/site/favicon.svg src/site/site.webmanifest site/
touch site/.nojekyll
[ -f src/site/og-image.png ] && cp src/site/og-image.png site/
urls < src/site/robots.txt > site/robots.txt
if [ -n "$SITE_URL" ]; then
  sed "s#__SITE_URL__#$SITE_URL#g" src/site/llms.txt > site/llms.txt
  printf '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>%s/</loc><lastmod>%s</lastmod><changefreq>monthly</changefreq></url>\n</urlset>\n' "$SITE_URL" "$(date +%Y-%m-%d)" > site/sitemap.xml
else
  sed "s#__SITE_URL__/#./#g" src/site/llms.txt > site/llms.txt
  rm -f site/sitemap.xml
fi
wc -c parity.html site/index.html
