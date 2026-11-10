#!/usr/bin/env bash
# Build a version that runs from any static host that only serves web/text files:
# models are shipped as base64 text and decoded in the browser.
set -e
rm -rf dist-share
VITE_MODEL_TXT=1 npx vite build --outDir dist-share
cd dist-share
for f in $(find models -name "*.glb"); do base64 -w0 "$f" > "$f.b64.txt" 2>/dev/null || base64 -i "$f" -o "$f.b64.txt"; rm "$f"; done
echo "Shareable build ready in dist-share/"
