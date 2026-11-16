#!/usr/bin/env bash
# Builds both archives into dist/:
#   site-overlay-<version>.zip           the extension alone, for the Chrome Web Store
#   site-overlay-<version>-unpacked.zip  a site-overlay/ folder with the extension and the guides,
#                                        for people who install it with "Load unpacked"
set -euo pipefail
cd "$(dirname "$0")/.."

extension=(manifest.json compare.html options.html src styles _locales icons)
guides=(README.md README.uk.md PRIVACY.md LICENSE)
readme_image=store/images/1-overlay-difference.png

version=$(node -p "require('./manifest.json').version")
store_zip="dist/site-overlay-$version.zip"
unpacked_zip="dist/site-overlay-$version-unpacked.zip"

mkdir -p dist
rm -f "$store_zip" "$unpacked_zip"
zip -qr -X "$store_zip" "${extension[@]}"

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
mkdir -p "$staging/site-overlay/$(dirname "$readme_image")"
cp -r "${extension[@]}" "${guides[@]}" "$staging/site-overlay/"
cp "$readme_image" "$staging/site-overlay/$readme_image"
(cd "$staging" && zip -qr -X "$OLDPWD/$unpacked_zip" site-overlay)

ls -1 "$store_zip" "$unpacked_zip"
