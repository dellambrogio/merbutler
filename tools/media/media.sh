#!/usr/bin/env bash
# Redo the README media in docs/: the light and dark screenshots, the demo video (MP4) and its GIF.
# Needs google-chrome, ffmpeg and Node 22+. Starts its own dev server and stops it at the end.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
docs="$root/docs"
port="${MEDIA_PORT:-5288}"
export MEDIA_BASE="http://localhost:$port/"
export MEDIA_WORK="$(mktemp -d)"

(cd "$root" && exec node_modules/.bin/vite --port "$port" --strictPort >"$MEDIA_WORK/vite.log" 2>&1) &
vite=$!
trap 'kill $vite 2>/dev/null || true; rm -rf "$MEDIA_WORK" /tmp/merbutler-chrome-*' EXIT
for _ in $(seq 50); do curl -fs "$MEDIA_BASE" >/dev/null && break; sleep 0.2; done

cd "$here"
echo "Screenshots…"
node screenshot.mjs light 2 "$docs/screenshot-light.png"
node screenshot.mjs dark 2 "$docs/screenshot-dark.png"

echo "Demo (about a minute)…"
node demo.mjs
# 1.6× faster than recorded; then a 960px GIF with a 96-color palette.
ffmpeg -y -v error -f concat -safe 0 -i "$MEDIA_WORK/frames.txt" \
  -vf "setpts=PTS/1.6,fps=25,scale=1280:720:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -pix_fmt yuv420p -crf 24 -movflags +faststart -an "$docs/demo.mp4"
ffmpeg -y -v error -i "$docs/demo.mp4" \
  -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  "$docs/demo.gif"
ls -la "$docs"
