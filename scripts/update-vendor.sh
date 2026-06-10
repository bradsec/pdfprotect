#!/bin/bash
# Downloads a pinned @libpdf/core release as a self-contained ESM bundle
# (no CDN at runtime) and verifies it against the recorded checksum before
# replacing js/vendor/libpdf-core.js.
set -euo pipefail

# Exact version to vendor. Bump this deliberately, then update
# scripts/vendor.sha256 with the new bundle hash printed on mismatch.
VERSION="0.3.6"
if [ -z "$VERSION" ]; then
  echo "ERROR: VERSION is not set: refusing to download an unpinned bundle." >&2
  exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
VENDOR_DIR="$SCRIPT_DIR/../js/vendor"
CHECKSUM_FILE="$SCRIPT_DIR/vendor.sha256"
MANIFEST="$VENDOR_DIR/libpdf-core.manifest.txt"
URL="https://esm.sh/@libpdf/core@$VERSION?bundle"

mkdir -p "$VENDOR_DIR"
# Temp file lives in the vendor dir so the final mv is a same-filesystem
# atomic rename and can never leave a truncated bundle.
TMP="$(mktemp "$VENDOR_DIR/.libpdf-core.js.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

echo "Downloading @libpdf/core@$VERSION..."
curl -fsSL "$URL" -o "$TMP"

ACTUAL="$(sha256sum "$TMP" | awk '{print $1}')"
EXPECTED="$(awk '{print $1; exit}' "$CHECKSUM_FILE" 2>/dev/null || true)"

if [ -z "$EXPECTED" ]; then
  echo "ERROR: $CHECKSUM_FILE is missing or empty." >&2
  echo "Downloaded bundle sha256: $ACTUAL" >&2
  echo "Review the download, record the hash in $CHECKSUM_FILE, then re-run." >&2
  exit 1
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "ERROR: checksum mismatch: refusing to overwrite the vendor bundle." >&2
  echo "  expected: $EXPECTED" >&2
  echo "  actual:   $ACTUAL" >&2
  echo "If you are deliberately updating the bundle, review the download," >&2
  echo "update $CHECKSUM_FILE with the new hash, and re-run." >&2
  exit 1
fi

mv "$TMP" "$VENDOR_DIR/libpdf-core.js"
trap - EXIT

{
  echo "package: @libpdf/core"
  echo "version: $VERSION"
  echo "source: $URL"
  echo "sha256: $ACTUAL"
} > "$MANIFEST"

echo "Done: vendor/libpdf-core.js ($(wc -c < "$VENDOR_DIR/libpdf-core.js") bytes)"
