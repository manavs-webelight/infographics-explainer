#!/usr/bin/env bash
# usage: draft.sh <scenes.json> [project_id]
# Validates, makes narration, renders a half-res draft + contact sheet.
# Pass the project_id from a previous run to redraft after an edit: unchanged narration is reused (fast).
set -euo pipefail
. "$(dirname "$0")/lib.sh"
[ -f "${1:-}" ] || { echo "usage: draft.sh <scenes.json> [project_id]" >&2; exit 2; }
ID="${2:-v-$(sha256sum "$1" | cut -c1-10)}"      # no id given: same scenes => same project
P="$ROOT/projects/$ID"
mkdir -p "$P"
cp "$1" "$P/scenes.json"                          # always the agent's latest scenes (pipeline re-adds timings)
rm -f "$P/video.mp4" "$P/contact-sheet.png"       # stale outputs would make the pipeline skip the render
ensure_services
run_make "$ID" --draft
echo "project_id: $ID"
echo "draft_video: $P/video.mp4"
echo "contact_sheet: $P/contact-sheet.png"
if [ -f "$P/video.srt" ]; then echo "subtitles: $P/video.srt"; fi
echo "NEXT: look at the contact sheet, tell the user, and WAIT for their explicit OK before final.sh $ID"
