# USAGE - infographic video tool

One command turns a concept into a narrated infographic MP4. You talk to the
agent; the machine does the rest.

## One-time setup
1. `cd explainer && npm install` (needs Node 22; all package versions are
   pinned - never update one package alone).
2. Start the voice server in its own terminal and leave it running:
   `cd ~/Documents/speech-to-text-research && .venv/bin/pocket-tts serve`
   It listens on port 8000. Default voice: **alba**.

## How to ask me for a video
Copy-paste and edit this:

> Make me a 60-second video for a general audience explaining **how DNS
> lookups work**. Draft first, then wait for my OK before the final render.
> Claims for stat/chart scenes: 65% of DNS queries use encryption
> (source: Cloudflare 2024 usage report).

What happens: the agent writes the scenes, validates them, synthesizes
narration, renders a **draft**, shows you a contact sheet, and **waits for
your OK** before rendering the final. Numbers in stat/chart scenes are always
listed with their sources first - never invented.

## Draft, then final
- Draft (fast, half resolution):  `npm run make -- --id my-topic --draft`
- Final (1920x1080, crf 18), only after your OK:  `npm run make -- --id my-topic`
- `make` is resumable: re-run the same command after any failure.
- Avoid `--force`: it re-synthesizes fresh (different) audio takes.
- Renders use 2 CPU workers by default (`REMOTION_CONCURRENCY=N` to override).

## Where output goes
    explainer/projects/<id>/
      scenes.json        the script (agent-authored, validated)
      audio/*.wav        narration clips (cached by text + voice)
      contact-sheet.png  every key frame on one image
      video.mp4          YOUR VIDEO
      log.json           steps, retries, on-screen claims

## Scene types available now (see: npm run catalog)
- **title** - heading card. text 60 chars, subtitle 90.
- **stat** - one big number. value 12 chars, label 40.
- **chart** - bar chart, 2-5 bars.
- **flow** - 3-5 node step diagram (can light up per sentence).
- **bullets** - up to 5 points (can light up per sentence, 60 chars each).
- **graph** - auto-laid-out diagram: 2-10 nodes, up to 14 edges, labels
  24 chars. Anything that would render below 28 px is refused with exact
  advice (remove N nodes / shorten which labels).
- **code** - syntax-highlighted snippet, max 12 lines x 60 chars, with an
  active-line highlight that follows the narration.
- **trace** - replays a REAL recorded run of a .py file (sandboxed: 5 s
  timeout, 512 MB, no network, max 50 states). Values come from the tool,
  never hand-typed.
Narration: 12-60 words per scene, or per step for stepped scenes (6-40 words).
No digits, %, &, "e.g." in narration text - the voice reads literally, so
"twenty percent", not "20%".

## When something fails (the 5 you will actually hit)
1. **"TTS request failed - is pocket-tts serve running?"** - start the server
   (setup step 2) and re-run the same `make` command. Nothing is lost.
2. **Validation errors on scenes.json** - the agent fixes two rounds by
   itself; if it stops, each error line names the exact field and limit to
   change.
3. **"graph text would render at NNpx"** - the graph does not fit the 28 px
   rule. Do exactly what the message says: remove the suggested number of
   nodes or shorten the named labels.
4. **"trace is STALE" / trace error** - re-run `make` (states are re-recorded
   automatically); if the snippet itself crashes, fix the .py file or the
   args first. Trace only runs .py files inside this project.
5. **Render died mid-way (closed lid, out of power)** - just re-run the same
   `make` command. Completed steps (especially audio) are cached and skipped.
