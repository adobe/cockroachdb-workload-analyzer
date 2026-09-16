#!/bin/sh
# Converts the raw Playwright recording (out/demo.webm) into the two assets
# published on the `media` branch: an MP4 for linking and a GIF for inline
# README embedding. Requires a system ffmpeg (brew install ffmpeg).
set -eu
cd "$(dirname "$0")/out"

ffmpeg -v error -y -i demo.webm \
  -c:v libx264 -pix_fmt yuv420p -crf 23 -preset slow -movflags +faststart \
  demo.mp4

# Two-pass palette GIF: 10 fps, 960 px wide keeps it under ~7 MB.
ffmpeg -v error -y -i demo.webm \
  -vf "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
  demo.gif

ls -la demo.mp4 demo.gif
