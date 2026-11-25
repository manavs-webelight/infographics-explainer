#!/usr/bin/env bash
# usage: final.sh <project_id>   -> 1080p render. Only after the user said OK to the draft.
set -euo pipefail
. "$(dirname "$0")/lib.sh"
ID="${1:?usage: final.sh <project_id>}"; P="$ROOT/projects/$ID"
[ -f "$P/audio-timing.json" ] || { echo "no draft for $ID: run draft.sh first" >&2; exit 1; }
if ! { grep -q '"draft": false' "$P/log.json" 2>/dev/null && [ -f "$P/video.mp4" ]; }; then
  ensure_services
  [ -f "$P/video.mp4" ] && mv "$P/video.mp4" "$P/video.draft.mp4"   # never --force: that re-synthesizes the voice
  run_make "$ID"
fi
echo "final_video: $P/video.mp4"
if [ -f "$P/video.srt" ]; then echo "subtitles: $P/video.srt"; fi
