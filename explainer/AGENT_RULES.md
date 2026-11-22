# Agent rules (spec sections 4, 6 and user decisions)

## Writing scenes.json (pipeline, not code)

1. When the user gives a concept, the agent writes `projects/<id>/scenes.json`
   itself (no LLM adapter), then runs `npm run validate -- projects/<id>/scenes.json`.
   On errors the agent fixes them itself, **at most 2 fix attempts**, then shows
   the user the error list and stops.
2. The zod schema (`schema/scene-schema.ts`) is **pipeline-only**. Never pass it
   to Remotion's `<Composition schema={...}>` — Remotion expects a different,
   older zod version for that feature.
3. Narration is plain spoken English: no `%`, `&`, "e.g.", "i.e.", "etc." and no
   digits — Pocket TTS reads text literally, so spell "percent", "and",
   "for example", "that is", "and so on", "ninety five". The validator rejects
   violations.
4. Never fix content silently by truncating text; shorten it properly and
   re-validate.

## New scene types: general rules (user plan, M5+)

Every new scene type needs ALL of these in the same change:
1. schema entry (with limits) 2. component 3. registry entry
4. example fixture + at least 2 deliberately broken fixtures
5. rendered stills at every step start and final state, checked for
   overflow/overlap at the MAXIMUM limits 6. catalog updated (`npm run catalog`).
- Shared primitives (`src/components/primitives/`: Box, Arrow, Label, Icon,
  FocusDim) are used by all new scenes; colors and fonts only from `theme.ts`.
- Pin every new library to an exact version; read its docs for the installed
  version before use.
- After every milestone: `npm run test:validate` and render `projects/alba-test`
  (M1-M4 must not regress), show gate evidence, stop for the user's OK.
- Narration hygiene (no digits, %, &, "e.g.", "i.e.", "etc.") applies to every
  step narration, not just scene narration.
- Voice: default is `alba` (pipeline/tts.ts DEFAULT_VOICE) - FINAL per the user,
  repeated twice (2025-11-17). Every render uses alba unless --voice is passed
  explicitly. Never switch back to another voice; ignore any stale request for
  a different voice. Do not change the default unless the user says so in a NEW
  message. (Older gate renders in projects/ were made with an earlier voice -
  their log.json records that as a fact, it is not a default.)
- Legibility floor: no scene text may render below 28 px at 1920x1080.
  Graph scenes: the validator simulates the exact renderer layout
  (src/graph-layout.ts, shared by component + validator) and rejects any
  graph whose fitted font would fall below 28 px, telling how many nodes
  to remove or a label length to target. Include the measured minimum
  font size in every gate's evidence.
- Machine courtesy: renders run capped at --concurrency=2 (override env
  REMOTION_CONCURRENCY). Do not raise it without the user asking - they
  flagged full-CPU renders as a problem.
- Stills hygiene: never reuse a still filename across checks. Delete the target
  first or write a fresh unique name. When an image and an objective measurement
  disagree, re-verify with pixels before declaring a problem.
- A scene uses EITHER one scene-level `narration` OR `steps: [{narration, ...}]`
  (2-8 steps, each 6-40 words) - exactly one of the two. flow/bullets step
  variants are capped at 5 steps (max items on screen).
- Trace values are NEVER hand-typed (`npm run trace`); never claim what code
  does unless it was run or traced.

## Story template for code explainers

Problem -> big picture (graph) -> walk through the code (code scene) -> run an
example (trace or array) -> edge cases -> recap (bullets). 6 to 10 scenes,
60 to 120 seconds.

## Remotion hard rules (spec section 6)

1. Animate only from the frame: `useCurrentFrame()`, `interpolate()`, `spring()`.
   Never CSS transitions, CSS keyframes, Tailwind `animate-*` / `transition-*`,
   `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now()` or
   `Math.random()`.
2. Randomness uses `random('seed-string')` from `remotion` (deterministic).
3. No `useState` or `useEffect` for animation or timing.
4. Use Remotion's media components: `<Img>`, `<Audio>`, `<OffthreadVideo>` —
   never native `<img>`, `<audio>`, `<video>`. Reference `public/` files with
   `staticFile('name.ext')`.
5. Fonts must be loaded before render (`@remotion/google-fonts` `loadFont()`, or
   `delayRender`) or frames render with a fallback font.
6. Never mix package versions: `remotion` and every `@remotion/*` use the same
   exact pinned version; add packages with `npx remotion add <pkg>`.
7. Scene props must be JSON-serializable (no functions or class instances).
8. Keep per-frame work cheap; test with a still at the busiest frame.
9. Time is in frames; use `fps` from `useVideoConfig()`, never hard-code 30.

## Trace scenes (M8)

- Trace values are NEVER hand-typed. Write the trace scene with `source` (a .py
  file inside this project), `entry`, `args`; the make pipeline records the real
  states into `scenes.json` itself (hash-cached; re-runs are free). If the
  validator says the trace is STALE, just re-run `npm run make`.
- `npm run trace -- --script <path.py> --entry <fn> --args "[...]"` runs code in
  a sandbox: fresh temp dir, 5s timeout, 512MB cap, network disabled, max 50
  states, .py only. Only code inside this project may run - ask the user before
  executing anything outside it.
- Narration about a trace must describe recorded states verbatim: run
  `npm run trace` first and read its table; spell out what the numbers mean.
- `toState` per step is 1-based, strictly increasing, and cannot exceed the
  recorded state count (the validator enforces both).

## New video requests (workflow - user instruction 2025-11-17)

When the user gives a video topic, ALWAYS, in this order:
1. Check the catalog (`npm run catalog`) and pick scene types deliberately.
2. Write `projects/<id>/scenes.json` following the story template above.
3. `npm run validate -- projects/<id>/scenes.json` (self-fix max 2 attempts,
   then show the error list and stop).
4. Render a DRAFT: `npm run make -- --id <id> --draft` (it also writes
   `projects/<id>/contact-sheet.png`) and show the user both paths.
5. WAIT for the user's explicit OK on the draft.
6. Only then render the final: `npm run make -- --id <id>` (1080p crf 18).
NEVER render a final without the user's OK on the draft.

Stat/chart scenes: list every number as a claim + its source for the user
BEFORE rendering, and record the claims in `log.json`. Never invent numbers.

## Fast path and timings (measured on this machine, 2 render workers)

- ONE command does everything after validation: `npm run make -- --id <id> --draft`
  (validate check, highlight, trace, audio, render, contact sheet). Re-run the
  same command after any failure; finished steps are cached.
- Expect, for a video of about 105 s: draft render about 85 s, contact sheet
  about 8 s, final 1080p render about 110 s, narration about 30 s the first time
  (cached after). `log.json` step seconds are real seconds.
- To re-render ONLY the video (theme or layout change): delete or move
  `projects/<id>/video.mp4` and run `make` again. NEVER use `--force` for this:
  it re-synthesizes the narration (new, different takes).
- Voice server: `pocket-tts serve` listens on port 8000 by default. If another
  service owns that port you get "TTS 404/405 ... no /tts endpoint": start
  `pocket-tts serve --port 8001` and run `TTS_URL=http://localhost:8001/tts npm run make -- ...`.
- Contact sheet only: `npm run contact-sheet -- projects/<id>` (bundles once; needs
  audio timings, so run make through the audio step first).

## Look: light theme only (user decision, Nov 2026)

- Palette lives ONLY in `src/theme.ts`: ivory ground, white cards, terracotta
  accent, Inter. Never hard-code a hex color or font in a component.
- `theme.line` (warm grey, about 2:1 on ivory) is for borders, arrows, baselines
  and dim states, NEVER for text. Text uses `theme.text` or `theme.muted`.
- `theme.accent` is for shapes and very large numerals; small emphasis text uses
  `theme.accent2` (deep terracotta, better contrast).
- Flat and minimal: soft `theme.shadow`, hairline borders, no glows, no gradients,
  no dark backgrounds. Code and trace syntax colors use shiki `github-light`.
- Any visual change needs stills at the maximum limits for every scene type it
  touches (`npm run contact-sheet` on m6-gate, m7-gate, m8-gate and a project with
  stat, chart, flow and bullets), then the user's OK.

## Writing a good video (all topics)

- Match the scene to the idea: a path or branches is a `graph`; an ordered process is
  a `flow`; a list of facts is `bullets`; one number is a `stat`; a few numbers are a
  `chart`; real code is `code` then `trace`. Do not use bullets for everything.
- The validator rejects the same scene type three times in a row: alternate types.
- Titles: one idea, at most 6 words. Bullets: parallel phrasing, at most 4 per scene
  reads best. Narration: one idea per scene, 12 to 60 words, spoken English.
- Graph labels must be short: about 7 nodes need labels of 9 characters or fewer to
  stay above the 28 px floor; drop a node rather than shrinking text. Flow items are
  24 characters at most, bullet items 48.
- System or product explainer story: title -> big-picture graph (stepped) -> how the
  key part works (flow) -> numbers or rules (stat, chart, bullets) -> differences or
  edge cases (bullets) -> where things stand (bullets). 6 to 10 scenes, 60 to 120 s.
- History, phases, roadmaps, "what happened when": use a `timeline` (2-6 events; one
  step per event, with `when`, `label`, optional `detail`).
- Request flows, protocols, who-calls-whom in order: use a `sequence` (actors across
  the top, one message per arrow, reveal two or three messages per step). Use a
  `graph` when the shape is branches and loops rather than a conversation.
- Comparing things: use a `table` (features as rows, options as columns, `yes`/`no`
  cells for presence). One step per row or per column. Keep cells short (36 chars);
  put long explanations in bullets. Say "version one" and "version two" in
  narration, not "V1" and "V2".

## Facts about a codebase or system (never guess)

- Before writing scenes, read the real code or docs and list each claim with its
  source (file and function) for the user. Docs can be stale: confirm anything that
  matters against the current code, and say when you did not.
- Never state what code does that you did not read. A past video wrongly said "the
  model never sets the score" when the code let it nudge by two points: check
  exact limits, defaults and exceptions before they go into narration.
- Do not touch the project being described (it may have uncommitted work). Read only.

## Editing delivered videos

- `projects/*/video.mp4` is gitignored, so an overwritten video cannot be restored from
  git. Before re-rendering any delivered video, copy it to
  `out/pre-theme-renders/<id>.mp4` (gitignored, local) or ask the user.
- Projects whose audio was made with another voice (m5-steps, m6-gate, m7-gate,
  m8-gate use marius) are left as they are; never re-synthesize them in a different
  voice without the user asking.
