#!/bin/sh
# Packages the extension for the stores: only the files the browser loads (no tests, docs or icon sources).
# The same zip works for addons.mozilla.org, the Chrome Web Store, Edge and Opera.
set -eu
cd "$(dirname "$0")/.."
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="dist/ring-light-$version.zip"
mkdir -p dist
rm -f "$out"
zip -qr "$out" manifest.json background.js content.js light.js light-window.js light.html popup.html popup.js _locales icons
echo "$out"
