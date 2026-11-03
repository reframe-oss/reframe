#!/usr/bin/env bash
# Rebuilds the self-hosted Cormorant Garamond files in src/app/fonts/.
#
# The UI sets the serif at three styles only (upright 400 for .display,
# upright 500 for .serif, italic 400 for .marker) and only for its own English
# copy, so the full Google Fonts variable files (300-700, Latin-1 and more,
# ~75 KB for the two Latin slices) are cut down to:
#   - upright: variable, wght limited to 400-500
#   - italic:  static 400
# each subset to printable ASCII plus the typographic punctuation the copy may
# use. Characters outside the subset fall back per glyph to the size-adjusted
# fallback serif, so nothing renders as a missing-glyph box.
#
# Needs fonttools and brotli (dev only, not a project dependency):
#   python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli
#   PYTHON=/tmp/fontenv/bin/python scripts/fonts/build-cormorant.sh
set -euo pipefail

PYTHON="${PYTHON:-python3}"
# google/fonts commit that last touched ofl/cormorantgaramond (pinned so the
# output is reproducible).
REV=3dd78844021e948ceb633d1dcee3f7885561b5d9
BASE="https://raw.githubusercontent.com/google/fonts/$REV/ofl/cormorantgaramond"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/src/app/fonts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL -o "$WORK/upright.ttf" "$BASE/CormorantGaramond%5Bwght%5D.ttf"
curl -fsSL -o "$WORK/italic.ttf" "$BASE/CormorantGaramond-Italic%5Bwght%5D.ttf"
curl -fsSL -o "$OUT/OFL.txt" "$BASE/OFL.txt"

# ASCII, nbsp, middle dot, multiplication sign, en/em dash, curly quotes, ellipsis.
UNICODES="U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013-2014,U+2018-2019,U+201C-201D,U+2026"
# kern/liga for text, lnum/tnum/pnum for the figures (Cormorant defaults to
# old-style numerals; .display and .marker switch to lining).
FEATURES="kern,liga,calt,lnum,tnum,pnum"

"$PYTHON" -m fontTools.varLib.instancer "$WORK/upright.ttf" wght=400:500 -o "$WORK/upright-400-500.ttf"
"$PYTHON" -m fontTools.varLib.instancer "$WORK/italic.ttf" wght=400 -o "$WORK/italic-400.ttf"

for name in upright-400-500 italic-400; do
  "$PYTHON" -m fontTools.subset "$WORK/$name.ttf" \
    --unicodes="$UNICODES" --layout-features="$FEATURES" \
    --flavor=woff2 --output-file="$OUT/cormorant-garamond-$name.woff2"
done

ls -l "$OUT"
