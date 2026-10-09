#!/usr/bin/env bash
# Renders the raster icons in static/ from the Superlibrary mark (the same three rects as
# static/favicon.svg and src/lib/Mark.svelte; change them together). The files are committed, so
# this runs only when the mark changes. Needs rsvg-convert (brew install librsvg) and ImageMagick.
#
# favicon.ico keeps the rounded tile (a tab draws it as is). Every home-screen icon is a full,
# opaque square: iOS rounds the corners itself and fills transparency with black, and a maskable
# icon must paint its whole canvas. `scale` is how much of the canvas the mark's 21-unit span
# covers; the maskable one is smaller so it stays inside the 80% safe zone whatever shape a
# launcher cuts.
set -euo pipefail
cd "$(dirname "$0")/../static"

MARK='<g fill="#ff7a59">
    <rect x="5.5" y="9.5" width="4.5" height="15.5" rx="1"/>
    <rect x="12" y="7" width="4.5" height="18" rx="1"/>
    <rect x="22.3" y="8" width="4.5" height="17" rx="1" transform="rotate(-20 22.3 25)"/>
  </g>'

render() { # <out.png> <px> <scale>
  local out=$1 px=$2 scale=$3
  local s off
  s=$(awk "BEGIN{print 21/$scale}")
  off=$(awk "BEGIN{print 16-$s/2}")
  rsvg-convert -w "$px" -h "$px" -b '#0f1118' -o "$out" /dev/stdin <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="$off $off $s $s">
  <rect x="$off" y="$off" width="$s" height="$s" fill="#0f1118"/>
  $MARK
</svg>
SVG
  # Opaque: no alpha channel at all, so iOS has nothing to fill with black.
  magick "$out" -alpha off -define png:color-type=2 "$out"
}

render icon-192.png 192 0.66
render icon-512.png 512 0.66
render icon-maskable-512.png 512 0.5
render apple-touch-icon.png 180 0.62

tmp=$(mktemp -d)
for px in 16 32 48; do rsvg-convert -w $px -h $px -o "$tmp/$px.png" favicon.svg; done
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" favicon.ico
rm -r "$tmp"
