#!/bin/bash
# Downloads @libpdf/core as a self-contained ESM bundle (no CDN at runtime).
set -e
VENDOR_DIR="$(dirname "$0")/../js/vendor"
mkdir -p "$VENDOR_DIR"
echo "Downloading @libpdf/core..."
curl -fsSL "https://esm.sh/@libpdf/core?bundle" -o "$VENDOR_DIR/libpdf-core.js"
echo "Done: vendor/libpdf-core.js ($(wc -c < "$VENDOR_DIR/libpdf-core.js") bytes)"
