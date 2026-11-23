#!/usr/bin/env bash
# Regenerates docs/store/promo-video.mp4 and docs/demo.gif from the extension's own code.
# Usage: docs/store/video/make-video.sh <music file>
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
MUSIC=${1:?usage: make-video.sh <music file>}
[ -f "$MUSIC" ] || { echo "music file not found: $MUSIC" >&2; exit 1; }

export RL_OUT
RL_OUT=$(mktemp -d)
trap 'rm -rf "$RL_OUT"' EXIT

node "$HERE/record.mjs"         # interactive part: real panel and light effect, frames in $RL_OUT/rec
python3 "$HERE/compose.py"      # adds the two-monitor scene and the end card, frames in $RL_OUT/final

FRAMES=$(find "$RL_OUT/final" -name '*.png' | wc -l)
SECONDS_LONG=$(python3 -c "print($FRAMES / 30)")
FADE_OUT_AT=$(python3 -c "print($SECONDS_LONG - 2.5)")
ffmpeg -loglevel error -y -framerate 30 -i "$RL_OUT/final/%04d.png" -i "$MUSIC" \
  -map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow \
  -af "afade=t=in:d=0.5,afade=t=out:st=$FADE_OUT_AT:d=2.5" -c:a aac -b:a 160k \
  -t "$SECONDS_LONG" -movflags +faststart "$REPO/docs/store/promo-video.mp4"

# README demo: the first 7.6 seconds as a looping GIF
ffmpeg -loglevel error -y -t 7.6 -i "$REPO/docs/store/promo-video.mp4" \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$REPO/docs/demo.gif"

echo "wrote docs/store/promo-video.mp4 (${SECONDS_LONG}s) and docs/demo.gif"
