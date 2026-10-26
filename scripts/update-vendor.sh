#!/bin/bash
# Builds the pinned @libpdf/core release into one self-contained ESM bundle
# (no CDN or runtime imports, which the CSP would block) and verifies it
# against the recorded checksum before replacing js/vendor/libpdf-core.js.
#
# Versions are pinned in scripts/vendor/package.json and its lockfile.
# To update: change the @libpdf/core version there, run
# `npm install --package-lock-only` in scripts/vendor, run this script, review
# the bundle, then record the printed hash in scripts/vendor.sha256 and re-run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/vendor"
VENDOR_DIR="$SCRIPT_DIR/../js/vendor"
CHECKSUM_FILE="$SCRIPT_DIR/vendor.sha256"
MANIFEST="$VENDOR_DIR/libpdf-core.manifest.txt"

# Temp file lives in the vendor dir so the final mv is a same-filesystem
# atomic rename and can never leave a truncated bundle.
TMP="$(mktemp "$VENDOR_DIR/.libpdf-core.js.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

# npm ci installs exactly what the lockfile records and verifies integrity.
(cd "$BUILD_DIR" && npm ci --ignore-scripts --no-audit --no-fund --silent)
VERSION="$(node -p "require('$BUILD_DIR/node_modules/@libpdf/core/package.json').version")"

echo "Bundling @libpdf/core@$VERSION..."
echo 'export * from "@libpdf/core";' | (cd "$BUILD_DIR" && ./node_modules/.bin/esbuild \
  --bundle --format=esm --platform=browser --target=es2022 \
  --legal-comments=inline --log-level=error --sourcefile=entry.mjs) > "$TMP"

# The bundle must not load modules at runtime; only the optional, never-called
# Google Cloud KMS signers keep dynamic imports.
if grep -nE '^import |^export .* from ' "$TMP"; then
  echo "ERROR: bundle still has static imports: refusing to install it." >&2
  exit 1
fi

ACTUAL="$(sha256sum "$TMP" | awk '{print $1}')"
EXPECTED="$(awk '{print $1; exit}' "$CHECKSUM_FILE" 2>/dev/null || true)"

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "ERROR: checksum mismatch: refusing to overwrite the vendor bundle." >&2
  echo "  expected: ${EXPECTED:-<none>}" >&2
  echo "  actual:   $ACTUAL" >&2
  echo "If you are deliberately updating the bundle, review the build," >&2
  echo "update $CHECKSUM_FILE with the new hash, and re-run." >&2
  exit 1
fi

mv "$TMP" "$VENDOR_DIR/libpdf-core.js"
trap - EXIT

{
  echo "package: @libpdf/core"
  echo "version: $VERSION"
  echo "source: npm (scripts/vendor/package-lock.json), bundled with esbuild"
  echo "sha256: $ACTUAL"
} > "$MANIFEST"

echo "Done: vendor/libpdf-core.js ($(wc -c < "$VENDOR_DIR/libpdf-core.js") bytes)"
