# Infographic Explainer Videos — fast because the agent only writes one small JSON file, and everything after that is static

Turn a concept ("how DNS lookups work") into a short, narrated 1080p infographic
video. You talk to the agent; the agent writes **one `scenes.json`**; then a
deterministic pipeline does the rest: validate → voice → time → render.

**Why this is fast.** The only expensive, creative step is the agent emitting a
single JSON file — a handful of scenes, ~150 words. Nothing downstream calls a
model to *generate* content. Every later step is plain, cacheable, resumable
machinery: schema validation, one voice call per narration line (cached by
text + voice), ffmpeg loudness/time measurement, and a static Remotion render.
The render is just "draw these React components at these frames." There is no
LLM loop, no per-frame AI, no image generation. Edit one scene and re-run: the
unchanged narration is reused, only the changed part re-renders. A 60-second
video drafts in ~1–2 minutes and finalises in ~2.

---

## Table of contents
- [What it does](#what-it-does)
- [How it works (the pipeline)](#how-it-works-the-pipeline)
- [Infographic types supported](#infographic-types-supported)
- [Local install](#local-install)
- [Using it from the agent (the skill)](#using-it-from-the-agent-the-skill)
- [Running it by hand (the CLI)](#running-it-by-hand-the-cli)
- [Output layout](#output-layout)
- [Draft vs final](#draft-vs-final)
- [Design & narration rules](#design--narration-rules)
- [Troubleshooting](#troubleshooting)
- [Models used](#models-used)
- [Tech stack](#tech-stack)

---

## What it does

One concept in, one MP4 out:

```
"explain how DNS lookups work"            explainer/projects/<id>/video.mp4
        │                                          ▲
        ▼                                          │
  agent writes scenes.json  →  validate → voice → time → render
        (the only AI step)        (all static, all cached)
```

A video is 3–8 scenes, 30 / 60 / 90 seconds, at 1920×1080, 30 fps, in a fixed
light theme (ivory ground, terracotta accent, Inter). Narration is written as
plain spoken English and synthesized with a local voice model
(**Kyutai Pocket TTS** — see [Models used](#models-used)). Optional subtitles
are written as a sidecar `.srt` (not burned in).

---

## How it works (the pipeline)

The `make` CLI runs numbered steps, each **skipped if already done and inputs
unchanged** (so it is resumable — re-run after any failure and cached work is
kept). Only step 2 is "the agent's job"; the rest is static machinery.

| # | Step | What happens | Cost / caching |
|---|------|--------------|----------------|
| 1 | **setup** | create `projects/<id>/`, write `concept.txt` | trivial |
| 2 | **script** | place the agent's `scenes.json`, validate against the zod schema | free (no LLM here) |
| 2.5 | **highlight** | tokenize `code` scenes with Shiki | cached by code hash |
| 2.75 | **trace** | record real execution states for `trace` scenes (sandboxed Python) | cached by source hash |
| 3 | **audio** | synthesize narration via Pocket TTS (sequential), loudness-normalize + resample with ffmpeg, measure each clip with ffprobe, write timings back into `scenes.json` | **cached by hash(text + voice)** |
| 4 | **render** | Remotion renders `scenes.json` → `video.tmp.mp4` → renamed `video.mp4` only when complete | the heavy step, scales with `--concurrency` |
| 4b | **sheet** | (drafts only) one still per scene/step tiled into `contact-sheet.png` | only on `--draft` |
| 4c | **srt** | write `video.srt` if `"captions": true` | trivial |
| 5 | **log** | `log.json` with step timings, retries, and on-screen numeric claims | trivial |

Key idea: speech timing is **measured, not guessed**. Each narration clip's real
duration is read with `ffprobe`, and scene/step durations in frames are derived
from the actual audio, so picture and voice stay in sync automatically.

---

## Infographic types supported

Pick the scene from the **shape of the idea**, not from what's available. A
simple topic is just `title` + `flow` + `stat` + `bullets`; the "special" types
must earn their place (at most one scene of each, at most two special types per
video). Run `npm run catalog` to see them rendered.

| Type | Use it when… | Structure (limits) |
|------|--------------|--------------------|
| **title** | opening or closing card | `text` ≤60, `subtitle` ≤90 |
| **stat** | one surprising, sourced number | `value` (number), `suffix` ≤4, `label` ≤60 |
| **chart** | a few numbers to compare | 2–5 bars, `{label, value}` |
| **flow** | ordered steps / a process | 2–5 steps, item ≤24 chars, lights up per sentence |
| **bullets** | a short list of points | ≤5 items ≤48 chars (plain or stepped) |
| **graph** | a real decision with branches/loop | 2–10 nodes, ≤14 edges, dagre auto-layout, focus per step |
| **table** | options compared on 2+ dimensions | 2–4 cols, ≤6 rows, cells ≤36; `yes`/`no` shows an icon; highlights a row/col/cell |
| **sequence** | several parties exchanging messages | 2–5 actors, 2–8 messages, reveals up to `toMessage` |
| **timeline** | events on dates/stages | 2–6 events along an axis, alternating above/below |
| **code** | the viewer should read code | ≤12 lines × 60 chars, Shiki highlighting, active-line follows narration |
| **trace** | replay a *real* run of a `.py` file | sandboxed Python (`sys.settrace`): 5 s timeout, 512 MB, no network, ≤50 states — values come from the tool, never hand-typed |

Every scene has either a scene-level `narration` (12–60 words) **or** `steps`
(each 6–40 words), never both. Structure rules: first scene a `title`, last a
`title` or `bullets`, ≥3 scenes, same type at most twice in a row.

---

## Local install

Prerequisites: **Node 22**, **npm**, **ffmpeg** + **ffprobe** on `PATH`, and the
**Pocket TTS** voice server. (Headless servers without a GPU are fine — Remotion
uses the `swiftshader` software renderer via `remotion.config.ts`.)

```bash
# 1. Install the tool
cd explainer
npm install            # or `npm ci` — all package versions are pinned; never bump one alone

# 2. Start the voice server in its own terminal and leave it running
cd ~/Documents/speech-to-text-research
.venv/bin/pocket-tts serve          # listens on port 8000; default voice: alba
# (the skill scripts use port 8001 by default and start the server for you)
```

If Remotion can't find or download Chrome, point it at an installed one in
`remotion.config.ts` with `Config.setBrowserExecutable('/usr/bin/google-chrome')`.

> Pinning matters: all `@remotion/*` packages must be the exact same version as
> `remotion` (4.0.544 here), with no `^`. Add new Remotion packages with
> `npx remotion add <pkg>` so versions stay in lockstep.

---

## Using it from the agent (the skill)

The agent skill lives in the repo at **`explainer/skill/infographic-video/`**
(`SKILL.md` + `scripts/draft.sh`, `final.sh`, `lib.sh`). It is installed into
the agent's skill folder by **symlink**, so editing the repo version is live:

```bash
ln -s "<repo>/explainer/skill/infographic-video" ~/.pi/agent/skills/infographic-video
```

The flow the skill drives (details in `SKILL.md`):

1. **Brief** the user — length (30/60/90), audience/depth, look, subtitles? Offer defaults.
2. **Spine** — one sentence for the whole idea; pick the one visual that carries it.
3. **Outline** — one line per scene; **wait for the user's OK**.
4. Write `scenes.json`.
5. `scripts/draft.sh /tmp/scenes.json [project_id]` → half-res draft + contact sheet.
6. Inspect the contact sheet, fix once, describe it.
7. **STOP and wait for the user's explicit OK.** Never auto-run the final.
8. `scripts/final.sh <project_id>` → full-res `video.mp4`.

`lib.sh` checks for `node`/`npm`/`ffmpeg`, runs `npm ci` if `node_modules` is
missing, and starts (or reuses) the voice server on `TTS_PORT` (default 8001).

---

## Running it by hand (the CLI)

All npm scripts run from the `explainer/` folder.

```bash
npm run dev                 # Remotion Studio: live browser preview
npm run make -- --id topic --draft    # half-res draft + contact sheet (~1–2 min)
npm run make -- --id topic            # full 1080p final, only after OK
npm run validate -- projects/topic/scenes.json   # zod + semantic checks
npm run test:validate               # validator's own test suite
npm run catalog                     # render every scene type
npm run contact-sheet -- projects/<id>           # rebuild one sheet
npm run render / npm run still      # raw Remotion render / single frame
```

Useful flags on `make`: `--id <id>`, `--from-scenes path`, `--concept "…"`,
`--draft`, `--voice alba`, `--stop-after script|audio|render`, `--force`
(avoid: re-synthesizes fresh, different audio takes). Set
`REMOTION_CONCURRENCY=N` to control render parallelism (measured on 8c/16t:
2 workers ≈ 47 s, 6 ≈ 20 s, 8 ≈ 17 s).

---

## Output layout

```
explainer/projects/<id>/
  scenes.json         the script (agent-authored, then pipeline adds timings)
  concept.txt         the original concept (if --concept was used)
  audio/*.wav         narration clips (cached by text + voice)
  audio-timing.json   measured durations / frame timings per scene & step
  contact-sheet.png   every key frame on one image (drafts)
  video.mp4           YOUR VIDEO
  video.srt           subtitles (only when "captions": true)
  log.json            steps, retries, on-screen numeric claims
```

This folder is generated output and is **gitignored** (`explainer/projects/` in
`.gitignore`), so it isn't meant to be committed.

---

## Draft vs final

| | Draft | Final |
|---|-------|-------|
| Command | `make -- --id x --draft` | `make -- --id x` |
| Resolution | half (`--scale=0.5`) | 1920×1080 |
| Codec / quality | h264, `crf 28`, jpeg frames | h264, `crf 18` |
| Also writes | `contact-sheet.png` | — |
| Time (≈100 s video) | ~1.5 min | ~2 min |
| Gate | free to run | **only after the user's OK** |

Re-running the same command after any interruption reuses cached audio and only
redoes unfinished work. Pass the same `project_id` when redrafting after an
edit so unchanged narration is reused (much faster).

---

## Design & narration rules

**Design (the validator enforces the hard parts):**
- One idea per scene. Screen shows keywords; narration says the sentence. Never put narration text on screen.
- Open with a hook (title or a real stat), close with the takeaway.
- Budget: 30 s ≈ 3–4 scenes / ~75 words, 60 s ≈ 5–6 / ~150, 90 s ≈ 7–8 / ~225 (speech ≈ 2.5 words/sec).
- Graph auto-layout breaks otherwise: ≤6 nodes, ≤2 edges into a node, short labels, no big "fail" hub.

**Narration (rejected otherwise — the voice reads text literally):**
- Plain spoken English, no digits, no `% &`, no "e.g./i.e./etc." — write "ninety five percent", "and", "for example".
- **Never invent numbers** for stat/chart scenes; use only sourced figures the user supplied.

**Never hand-write these fields — the pipeline fills them in:**
`audioSeconds`, `audioFile`, `words`, `durationInFrames`, `tokens`, `trace`,
`traceHash`, `codeHash`.

---

## Troubleshooting

1. **"TTS request failed — is `pocket-tts serve` running?"** → start the server, re-run the same command. **"405/404, no /tts endpoint"** → port 8000 is taken; `pocket-tts serve --port 8001` and use `TTS_URL=http://localhost:8001/tts`.
2. **Validation errors on `scenes.json`** → the agent fixes two rounds itself; each error names the exact field and limit.
3. **"graph text would render at NNpx"** → violates the 28 px fit rule; remove the suggested nodes or shorten the named labels.
4. **"trace is STALE" / trace error** → re-run `make` (states re-record automatically); fix the `.py` if the snippet itself crashes. Trace only runs `.py` files inside this project.
5. **Render died mid-way (lid closed, out of power)** → just re-run; completed steps (especially audio) are cached and skipped.

---

## Models used

One model total, and it does exactly one thing.

| Role | What runs it | Model? |
|------|--------------|--------|
| **Narration voice** | **Kyutai Pocket TTS** — `pocket-tts` **4.0.1**, the `pocket-tts-without-voice-cloning` build; ~**100M parameters**, **CPU-only**, 24 kHz mono output, streaming, roughly **6× real time** | ✅ the only model |
| **Script / scenes.json** | **No model call.** The coding agent authors `scenes.json` itself and fixes its own validation errors (max 2 rounds). `make-video.ts` records `retries: 0 // no LLM step` | ❌ |
| Graph layout | `@dagrejs/dagre` — deterministic layered layout | ❌ |
| Code highlighting | `shiki` — static TextMate grammars | ❌ |
| `trace` scenes | CPython `sys.settrace` — real values from a real run | ❌ |
| Word/clip timing | `ffprobe` measures actual WAV duration (no `@remotion/install-whisper-cpp`; no transcription model) | ❌ |
| Typography | **Inter** from the system font stack (`@remotion/google-fonts` is not installed, so nothing is bundled or fetched) | ❌ |
| Image / video generation | **None.** Every pixel is drawn by React components | ❌ |

**About Pocket TTS** (details in `spec.md` §9):
- **Voice:** `alba` is the default and the narration voice for this project. `marius` also exists. Both are predefined voices.
- **No voice cloning.** The gated `kyutai/pocket-tts` repo isn't in the local Hugging Face cache, so `has_voice_cloning = False` — passing a WAV raises `VOICE_CLONING_UNSUPPORTED`. Cloning would need an `HF_TOKEN` with access. No feature may depend on it.
- **Not thread-safe:** synthesis is sequential, one clip at a time. Never two jobs against one model.
- **Hot server, not per-call loading:** `pocket-tts serve` keeps the model loaded; `quantize=True` is ~27% faster and ~48% less RAM.
- **No word timestamps** from this model — hence measuring the rendered audio with `ffprobe`.
- **Reads text literally**, which is why narration bans digits, `%`, `&`, "e.g." and "etc."

**The deliberate design point:** the agent is the only intelligence in the
loop, and it spends it on one small JSON file. Because no model runs inside the
pipeline, there is no API key, no per-video LLM cost, no generation retry loop,
and no non-determinism after `scenes.json` exists — which is exactly why the
pipeline is fast, resumable, and byte-for-byte reproducible for a given script.

---

## Tech stack

**Rendering & UI**
- **Remotion 4.0.544** — React video framework; renders a React component tree frame-by-frame to MP4.
- **React 19** + **TypeScript** (`tsconfig`, ES2020, `react-jsx`).
- `@remotion/transitions` (fade scene transitions), `@remotion/shapes`, `@remotion/paths` — transitions, shapes, arrow/line geometry.
- `@remotion/bundler` + `@remotion/renderer` — programmatic bundle + still/contact-sheet rendering.
- Headless **Chromium** with the **`swiftshader`** software GL renderer (GPU-free friendly).

**Content & logic**
- **zod 4.6.7** — `schema/scene-schema.ts` is the single source of truth for the scene JSON; `pipeline/validate.ts` adds semantic checks.
- **`@dagrejs/dagre` 3.1.3** — automatic layered layout for `graph` scenes.
- **shiki 4.6.0** — syntax highlighting for `code` scenes (tokens cached by hash).
- **lucide-react** — icons.

**Audio & video I/O**
- **Kyutai Pocket TTS** (`pocket-tts serve`) — the one model in the pipeline; see [Models used](#models-used).
- **ffmpeg** — loudness-normalize (`loudnorm`) and resample to 48 kHz mono.
- **ffprobe** — measure each clip's real duration to derive frame timings.

**Execution sandbox (trace scenes)**
- **Python 3** `sys.settrace` harness (`trace-harness.py`) run in a subprocess: copied to a temp dir, 5 s wall timeout, `RLIMIT_CPU`/`AS`/`FSIZE`, network blocked (socket kill-switch + `unshare -rn` when available), ≤50 states.

**Orchestration**
- **Node 22** running the pipeline as TypeScript CLIs (`node --no-warnings pipeline/*.ts`, native type-stripping) — no build step.
- **bash** skill scripts (`draft.sh` / `final.sh` / `lib.sh`) + npm scripts as the CLI surface.

**Design**
- Light theme only: ivory ground (`#F4F3EE`), terracotta accent (`#D97757`), **Inter** typeface. All colors and the "muted-not-line" text-contrast rule live in `src/theme.ts`.

**Layout of the repo**
- `explainer/` — the tool (Remotion app in `src/`, pipeline in `pipeline/`, schema in `schema/`, skill in `skill/`, per-video output in `projects/`).
- `spec.md` — full build spec (architecture, schema, animation recipes, TTS, milestones).
- `explainer/USAGE.md` / `explainer/AGENT_RULES.md` — operator usage and agent rules.
- `samples/`, `evidence/` — voice samples and milestone/QA artifacts.
