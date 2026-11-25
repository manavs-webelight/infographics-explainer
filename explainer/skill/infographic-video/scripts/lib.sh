# Shared by draft.sh / final.sh. Finds the explainer dir, makes sure its services are up.
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/../../.." && pwd)"   # .../explainer
TTS_PORT="${TTS_PORT:-8001}"
export REMOTION_CONCURRENCY="${REMOTION_CONCURRENCY:-6}"   # measured on 8c/16t: 2=47s, 6=20s, 8=17s
export TTS_URL="http://localhost:${TTS_PORT}/tts"
POCKET="${POCKET_TTS_BIN:-$(command -v pocket-tts || echo "$HOME/Documents/speech-to-text-research/.venv/bin/pocket-tts")}"

up() { (echo > "/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

ensure_services() {
  for t in node npm ffmpeg; do command -v "$t" >/dev/null || { echo "ERROR: $t not on PATH" >&2; exit 1; }; done
  [ -d "$ROOT/node_modules" ] || (cd "$ROOT" && npm ci >&2)
  up "$TTS_PORT" && return 0   # already running (ours or yours): reuse
  [ -x "$POCKET" ] || { echo "ERROR: pocket-tts not found at $POCKET (set POCKET_TTS_BIN)" >&2; exit 1; }
  echo "starting voice server on port $TTS_PORT ..." >&2
  setsid nohup "$POCKET" serve --port "$TTS_PORT" >/tmp/pocket-tts.log 2>&1 &   # detached: outlives this script
  for _ in $(seq 120); do up "$TTS_PORT" && return 0; sleep 1; done
  echo "ERROR: voice server did not start (see /tmp/pocket-tts.log)" >&2; exit 1
}

# run make for project $1 with extra args; show only the tail on failure, the last line on success
run_make() {
  local id="$1"; shift
  local out="$ROOT/projects/$id/make.log"
  mkdir -p "$ROOT/projects/$id"
  if (cd "$ROOT" && npm run -s make -- --id "$id" "$@") >"$out" 2>&1; then
    tail -n 1 "$out"
  else
    echo "FAILED. Fix the errors below, then run again:" >&2
    grep -v -E "^\s*$|Rendered|Encoded|Bundling|Compositing" "$out" | tail -n 40 >&2
    exit 1
  fi
}
