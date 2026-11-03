#!/usr/bin/env bash
# Recreates the video fixtures used by the end-to-end export tests.
# Output goes to test/fixtures/ (gitignored). Needs the ffmpeg CLI
# (macOS: `brew install ffmpeg`, Ubuntu: `sudo apt-get install ffmpeg`).
#
#   scripts/make-fixtures.sh          # all fixtures
#   scripts/make-fixtures.sh --small  # everything except the ~300 MB clip
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=test/fixtures
mkdir -p "$OUT"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found; install it first." >&2; exit 1; }

ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

# A moving test pattern with a tone, so trims, speed changes and audio edits
# are visible in the output.
video() { echo "testsrc2=size=$1:rate=30:duration=$2"; }
tone() { echo "sine=frequency=440:sample_rate=48000:duration=$1"; }

echo "normal.mp4: 1280x720 H.264/AAC, 10 s"
ff -f lavfi -i "$(video 1280x720 10)" -f lavfi -i "$(tone 10)" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -c:a aac -b:a 128k \
  -movflags +faststart -shortest "$OUT/normal.mp4"

# Browser screen recordings (MediaRecorder) are written as a live stream: the
# WebM header has no duration and there are no cues, so <video>.duration is
# Infinity until the whole file is read. `-live 1` produces the same layout.
echo "no-duration.webm: 1280x720 VP8/Opus, 6 s, no duration in the container"
ff -f lavfi -i "$(video 1280x720 6)" -f lavfi -i "$(tone 6)" \
  -c:v libvpx -b:v 1M -deadline realtime -cpu-used 8 -c:a libopus \
  -f webm -live 1 -shortest "$OUT/no-duration.webm"

echo "portrait.mp4: 720x1280 H.264/AAC, 6 s"
ff -f lavfi -i "$(video 720x1280 6)" -f lavfi -i "$(tone 6)" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -c:a aac -b:a 128k \
  -movflags +faststart -shortest "$OUT/portrait.mp4"

echo "no-audio.mp4: 1280x720 H.264, 6 s, no audio track"
ff -f lavfi -i "$(video 1280x720 6)" \
  -c:v libx264 -pix_fmt yuv420p -preset veryfast -an \
  -movflags +faststart "$OUT/no-audio.mp4"

if [[ "${1:-}" != "--small" ]]; then
  # Noise defeats compression, so a constant 40 Mb/s for 60 s lands near 300 MB.
  echo "large.mp4: 1920x1080 H.264/AAC, 60 s, ~300 MB (memory testing)"
  ff -f lavfi -i "$(video 1920x1080 60),noise=alls=60:allf=t" -f lavfi -i "$(tone 60)" \
    -c:v libx264 -pix_fmt yuv420p -preset ultrafast \
    -b:v 40M -minrate 40M -maxrate 40M -bufsize 80M \
    -c:a aac -b:a 128k -movflags +faststart -shortest "$OUT/large.mp4"
fi

echo
for f in "$OUT"/*.{mp4,webm}; do
  [[ -e "$f" ]] || continue
  printf '%-28s %8s  duration=%s\n' "$f" "$(du -h "$f" | cut -f1)" \
    "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done
