#!/bin/sh
# Rebuilds macos/Notepluspp/AppIcon.icns from the 1024px render in build/icon.png.
set -e
cd "$(dirname "$0")/.."
set_dir=$(mktemp -d)/AppIcon.iconset
mkdir -p "$set_dir"
for size in 16 32 128 256 512; do
  sips -z $size $size build/icon.png --out "$set_dir/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) build/icon.png --out "$set_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$set_dir" -o macos/Notepluspp/AppIcon.icns
