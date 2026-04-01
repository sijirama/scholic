#!/usr/bin/env zsh
set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

# ── 1. Build with production URLs ─────────────────────────────────────────────
echo "Building extension..."
API_BASE=https://api.scholic.com/api WEB_URL=https://scholic.com node build.mjs

# ── 2. Sanity check ───────────────────────────────────────────────────────────
if ! grep -q "api.scholic.com" background.js; then
  echo "ERROR: api.scholic.com not found in background.js — build env vars were not picked up. Aborting."
  exit 1
fi
echo "Sanity check passed."

# ── 3. Zip ────────────────────────────────────────────────────────────────────
VERSION=$(node -p "require('./package.json').version")
ZIPFILE="scholic-extension-v${VERSION}.zip"

rm -f "$ZIPFILE"

zip -r "$ZIPFILE" \
  manifest.json \
  background.js \
  content.js \
  viewer.js \
  viewer.html \
  content.css \
  pdf_viewer.css \
  pdf.worker.min.mjs \
  icons/

echo ""
echo "Done! -> ${SCRIPT_DIR}/${ZIPFILE}"
echo "Upload this file to the Chrome Web Store Developer Dashboard."
