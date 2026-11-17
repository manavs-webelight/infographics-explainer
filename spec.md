# Agent Spec: Code-Driven Infographic Explainer Video Generator

Nov 16, 2026 · **@Harsh**

## 1. Goal, scope and definition of done

Build a tool that turns a one-line concept ("How vaccines work") into a finished 1080p infographic explainer MP4 with narration, with no manual editing. The person gives the concept; the agent runs one command and hands back a video.

**What the agent builds**

* A Remotion (React) project with a fixed library of animated scene components.
* A JSON "scene script" format that fully describes a video.
* A pipeline: concept to scene JSON (user's own LLM), scene JSON to narration audio (user's own TTS), audio plus scenes to MP4.
* A `make-video` command-line tool, with a clean folder per video.
* Optionally, a small job service that wraps the same command (section 12).

**Non-goals (do not build these)**

* No background music.
* No AI-generated images or video clips inside scenes. Visuals are code: text, shapes, icons, charts, SVG.
* No live editing UI. Remotion Studio is enough for previews.
* No multi-user accounts, billing or auth.

**Core principles**

1. **The LLM writes JSON, never component code.** A normal video run must not generate or edit React code. New visuals are added by a developer (the agent in "development mode") as new components, then registered.
2. **Everything is frame-driven and deterministic.** Same JSON and audio in, same video out.
3. **Every video lives in its own folder** so jobs never overwrite each other and any video can be re-rendered or edited later.
4. **Fail early.** Validate the JSON before spending time on TTS or rendering.

**Definition of done**

* `npm run make -- --concept "How vaccines work" --id vaccines-01` produces `projects/vaccines-01/video.mp4` with narration synced to scenes.
* A bad LLM output is caught by validation and retried automatically at most twice.
* Draft (720p) and final (1080p) render modes both work.
* All checks in section 13 pass.

**Licensing note:** Remotion is free for individuals and very small companies; larger companies need a paid license. The user is an individual, so no license action is needed. Re-check [Remotion&#39;s license page](https://www.remotion.dev/docs/license) if that changes.

## 2. Architecture and pipeline

[embed: node/3b09744d-20df]

The only things passed between steps are files in the video's own folder, mainly `scenes.json`. That is why any step can be re-run alone, cached, or resumed after a failure. Your LLM and your TTS are the only external pieces; Remotion and FFmpeg run locally.

| Step         | Reads                           | Writes                                                                | Skipped when                                                 |
| ------------ | ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Concept   | CLI arguments                   | `concept.txt`                                                       | never                                                        |
| 2. Script    | `concept.txt`, schema catalog | `scenes.json`(draft)                                                | `--from-scenes`given, or script cached for the same inputs |
| 3. Validate  | `scenes.json`                 | `scenes.json`(validated), errors for retry                          | never                                                        |
| 4. Narration | each scene's `narration`      | `audio/scene-N.wav`                                                 | text, voice and speed unchanged (hash cache)                 |
| 5. Timing    | audio files                     | `audioFile`,`audioSeconds`,`durationInFrames`in `scenes.json` | audio unchanged                                              |
| 6. Render    | `scenes.json`,`audio/`      | `video.mp4`,`log.json`                                            | `--stop-after`set before it                                |

**Where each piece lives.** `pipeline/` (Node scripts) runs steps 1 to 5 and calls the renderer; `src/` (React) holds only what Remotion draws; `schema/` holds the zod schema both sides share. No file in `src/` may call the LLM, the TTS or the network.

## 3. Setup and project structure

Use Node 18 or newer and npm. Chrome or Chromium must be available to Remotion (it downloads its own headless browser on first render; on a locked-down server point to an installed one with `Config.setBrowserExecutable`).

**Create the project**

```bash
npx create-video@latest   # choose Blank, TypeScript, TailwindCSS optional
cd my-video && npm install
npm run dev               # Remotion Studio: live preview in the browser
```

**Install packages.** All `@remotion/*` packages must be the exact same version as `remotion`, with no `^` in package.json. Always add them with the CLI so versions match:

```bash
npx remotion add @remotion/transitions
npx remotion add @remotion/shapes
npx remotion add @remotion/paths
npx remotion add @remotion/google-fonts   # optional: web fonts
npx remotion add @remotion/layout-utils   # optional: measure and fit text
npm i lucide-react zod                     # icons, schema validation
```

**Folder layout**

```text
explainer/
  remotion.config.ts        # Chrome path, renderer flags
  package.json
  schema/scene-schema.ts    # zod schema = single source of truth for scene JSON
  src/
    index.ts                # registerRoot
    Root.tsx                # <Composition> with calculateMetadata
    Video.tsx               # maps scenes[] to components
    theme.ts                # colors, fonts, sizes
    anim.ts                 # shared animation helpers (useIn, stagger, etc.)
    components/             # one file per scene type + index.ts registry
  pipeline/
    make-video.ts           # CLI entry point
    llm.ts                  # generateScript(concept) -> scenes JSON
    tts.ts                  # synthesize(text) -> audio file
    validate.ts             # zod validation + semantic checks
    render.ts               # calls Remotion renderer
  projects/<video-id>/      # one folder per video
    concept.txt
    scenes.json             # validated scene script
    audio/scene-0.wav ...   # narration, one per scene
    video.mp4               # final output
    log.json                # timings, errors, retries
  AGENT_RULES.md            # short rules file for any coding agent (section 6 rules)
```

**Fixed settings (put in `theme.ts` and the Composition):** 1920x1080, 30 fps, dark navy background, one accent color per scene type family. Changing these is a deliberate decision, not something an agent does mid-task.

**Config for headless servers (`remotion.config.ts`)**

```ts
import {Config} from '@remotion/cli/config';
Config.setBrowserExecutable('/usr/bin/google-chrome'); // only if Remotion cannot find or download Chrome
Config.setChromiumOpenGlRenderer('swiftshader');       // software GL on machines without a GPU
```

Remove or adjust these lines on a normal desktop.

## 4. Scene JSON schema and validation

One zod schema is the single source of truth: the LLM prompt is generated from it, the validator runs it, and the components' prop types are inferred from it. Every scene has a `type`, a `narration` string, and type-specific fields. Timing fields (`durationInFrames`, `audioFile`) are added by the pipeline, never by the LLM.

```ts
// schema/scene-schema.ts
import {z} from 'zod';

const base = {
  narration: z.string().min(10).max(400),            // spoken text for this scene
  durationInFrames: z.number().int().positive().optional(), // set by pipeline from audio length
  audioSeconds: z.number().optional(), words: z.array(z.object({text: z.string(), start: z.number(), end: z.number()})).optional(), // also set by pipeline
  audioFile: z.string().optional(),                   // set by pipeline, e.g. audio/scene-0.wav
};

export const SceneSchema = z.discriminatedUnion('type', [
  z.object({...base, type: z.literal('title'),   text: z.string().max(60), subtitle: z.string().max(90).optional()}),
  z.object({...base, type: z.literal('flow'),    title: z.string().max(50).optional(), steps: z.array(z.string().max(24)).min(2).max(5)}),
  z.object({...base, type: z.literal('stat'),    value: z.number(), suffix: z.string().max(4).optional(), label: z.string().max(60)}),
  z.object({...base, type: z.literal('chart'),   title: z.string().max(50), data: z.array(z.object({label: z.string().max(12), value: z.number()})).min(2).max(6)}),
  z.object({...base, type: z.literal('bullets'), title: z.string().max(50), items: z.array(z.string().max(48)).min(2).max(5)}),
]);

export const ScriptSchema = z.object({
  title: z.string(),
  scenes: z.array(SceneSchema).min(3).max(14),
});
export type Scene = z.infer<typeof SceneSchema>;
```

**Scene types and the fields the LLM may fill**

| type    | required fields | limits                             | use for                                |
| ------- | --------------- | ---------------------------------- | -------------------------------------- |
| title   | text            | text 60 chars, subtitle 90         | opening and closing scenes             |
| flow    | steps           | 2 to 5 steps, 24 chars each        | processes, cause and effect, pipelines |
| stat    | value, label    | one number, optional suffix like % | one striking number                    |
| chart   | title, data     | 2 to 6 bars, labels 12 chars       | comparing a few values                 |
| bullets | title, items    | 2 to 5 items, 48 chars each        | summaries, takeaways                   |

The limits exist because text must fit on a 1920x1080 frame without overflow. If a new scene type is added, add its schema, its component, its registry entry and one example in the same change.

**Example script**

```json
{
  "title": "How vaccines work",
  "scenes": [
    {"type": "title", "text": "How Vaccines Work", "subtitle": "A 60-second explainer",
     "narration": "Let's look at how vaccines train your body to fight disease."},
    {"type": "flow", "title": "The process", "steps": ["Weakened virus", "Immune response", "Antibodies"],
     "narration": "A vaccine shows your immune system a harmless piece of a virus, which triggers a response and builds antibodies."},
    {"type": "stat", "value": 95, "suffix": "%", "label": "reduction in severe cases",
     "narration": "For many vaccines, severe cases drop dramatically among the vaccinated."}
  ]
}
```

**Validation steps (`pipeline/validate.ts`), in order**

1. Parse JSON. Strip code fences and surrounding prose if the LLM added them.
2. Run `ScriptSchema.safeParse`. On failure, collect zod error paths and messages.
3. Semantic checks: first scene is `title`; last scene is `title` or `bullets`; no two identical consecutive scene types more than twice; narration word count per scene between 12 and 60 (about 5 to 25 seconds); no empty strings.
4. On any failure, send the error list back to the LLM (section 10) and retry, at most twice. After that, stop with a clear error and save the bad output to `log.json`.

Never "fix" content silently by truncating text; ask the LLM to shorten it.

## 5. Component library

Each scene type is one React component in `src/components/`, registered in `src/components/index.ts` as `registry[type]`. A working first version of the five starter components already exists in the test project; the agent should reproduce or extend them to match this spec.

**Component contract (applies to every component)**

* Props = the scene's fields from section 4 (inferred from the zod type). No other props.
* Fills the full 1920x1080 frame, with 120 px padding, using the shared `Layout` wrapper (dark background, fixed font).
* All animation is derived from `useCurrentFrame()` relative to the scene start (a `Sequence` resets frame to 0). Never reads absolute time.
* Entrance animation finishes within the first 40 frames (about 1.3 s). After that the scene is static or has subtle motion, so the narration can be heard without distraction.
* Content stays on screen until the scene ends. The scene is at least as long as its narration audio plus a 10-frame tail.
* Text is never smaller than 36 px. Titles 64 to 110 px. Max 5 items on screen.
* Colors and fonts come only from `theme.ts`.

**Starter components**

| type    | what it draws                                        | animation                                                                |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| title   | accent bar, large title, optional subtitle           | bar grows, title and subtitle slide up and fade in, 12 frame stagger     |
| flow    | row of step cards joined by arrows, optional heading | cards scale in, arrows slide in, 14 frame stagger per step               |
| stat    | one huge number with label                           | count-up from 0 over 45 frames, label fades in at frame 25               |
| chart   | vertical bar chart with values and labels            | bars grow from baseline, 10 frame stagger, alternating two accent colors |
| bullets | heading plus check-mark list                         | items slide in from the right, 16 frame stagger                          |

**Skeleton for a new component**

```tsx
// src/components/Comparison.tsx
import {Layout} from './Layout';
import {theme} from '../theme';
import {useIn} from '../anim';

export const Comparison: React.FC<{left: {title: string; points: string[]}; right: {title: string; points: string[]}}> = ({left, right}) => {
  const a = useIn(0), b = useIn(14);
  return (
    <Layout>
      <div style={{display: 'flex', gap: 60}}>
        <Column data={left} progress={a} color={theme.accent} />
        <Column data={right} progress={b} color={theme.accent2} />
      </div>
    </Layout>
  );
};
```

Then: (1) add the zod schema entry, (2) add to `registry`, (3) add one example scene to `examples/` and render a still (`npx remotion still ... --frame=45`) to check it, (4) update the LLM prompt's scene list (it is generated from the schema).

**Suggested next components (build in this order)**

1. `comparison`: two columns, A versus B, 3 points each.
2. `timeline`: horizontal line with 3 to 6 dated or ordered milestones.
3. `quote`: large quote text with attribution (use only for the user's own text, not copyrighted material).
4. `iconGrid`: 3 to 6 icons (Lucide) with short labels.
5. `donut`: one percentage or parts of a whole, drawn with `@remotion/shapes` Pie or SVG.
6. `lineChart`: a trend over 4 to 10 points, using `evolvePath` to draw the line on.
7. `definition`: a term in large type with a one-sentence meaning.
8. `outro`: summary plus call to action text.

Keep the set small. Fewer, well-built components beat many rough ones.

## 6. Remotion core API and hard rules

A Remotion video is a React component that renders one frame at a time. Remotion opens the page in headless Chrome, sets the frame number, takes a screenshot, and repeats for every frame (many tabs in parallel), then encodes with FFmpeg. So every component must be a  **pure function of the frame number and its props** .

**Hard rules (copy these into `AGENT_RULES.md`)**

1. **Animate only from the frame.** Use `useCurrentFrame()`, `interpolate()` and `spring()`. Never use CSS transitions, CSS keyframe animations, Tailwind `animate-*` or `transition-*` classes, `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now()` or `Math.random()`. They will flicker or render wrongly.
2. **Randomness uses `random('seed-string')` from `remotion`.** It is deterministic across frames and tabs.
3. **No `useState` or `useEffect` for animation or timing.** Frames render in separate tabs, so state is not shared.
4. **Use Remotion's media components:** `<Img>`, `<Audio>`, `<OffthreadVideo>`. Never the native `<img>`, `<audio>`, `<video>`. Reference files in `public/` with `staticFile('name.ext')`.
5. **Fonts must be loaded before render** (see section 7, `@remotion/google-fonts`, or `delayRender`). Otherwise frames render with a fallback font.
6. **Never mix package versions.** `remotion` and every `@remotion/*` package use the same exact version. Add packages with `npx remotion add <pkg>`.
7. **Props must be JSON-serializable** (strings, numbers, arrays, plain objects). No functions or class instances in scene props.
8. **Keep frame work cheap.** No heavy loops or huge SVG filters per frame; test with a still at the busiest frame.
9. **Time is in frames.** Seconds = frames / fps. Always use `fps` from `useVideoConfig()` rather than hard-coding 30 in components.

**API you will use most**

| API                                                                                                    | What it does                                                                        | Example                                                              |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `useCurrentFrame()`                                                                                  | current frame, relative to the nearest parent `Sequence`                          | `const frame = useCurrentFrame();`                                 |
| `useVideoConfig()`                                                                                   | `fps`,`width`,`height`,`durationInFrames`of the composition                 | `const {fps} = useVideoConfig();`                                  |
| `interpolate(input, inRange, outRange, opts)`                                                        | map a number range to another, linear by default                                    | `interpolate(frame, [0, 30], [0, 1], {extrapolateRight: 'clamp'})` |
| `Easing`                                                                                             | easing functions for `interpolate`                                                | `easing: Easing.out(Easing.cubic)`,`Easing.bezier(0.2, 0, 0, 1)` |
| `spring({frame, fps, config, delay})`                                                                | physics-based 0 to 1 curve;`damping: 200`gives a smooth, non-bouncy ease          | `spring({frame, fps, delay: 12, config: {damping: 200}})`          |
| `interpolateColors()`                                                                                | animate between colors                                                              | `interpolateColors(p, [0, 1], ['#38bdf8', '#fb923c'])`             |
| `<AbsoluteFill>`                                                                                     | full-frame absolutely positioned container                                          | `<AbsoluteFill style={{background: '#0f172a'}}>`                   |
| `<Sequence from durationInFrames>`                                                                   | shows children during a frame range and resets `useCurrentFrame`to 0 inside       | `<Sequence from={30} durationInFrames={60}>`                       |
| `<Series>`/`<Series.Sequence>`                                                                     | place scenes back to back without computing `from`                                | durations only                                                       |
| `<Loop>`,`<Freeze>`                                                                                | repeat or hold a frame range                                                        | for looping icons                                                    |
| `<Audio src startFrom endAt volume>`                                                                 | plays audio in the video (inside a `Sequence`it starts with that sequence)        | `<Audio src={staticFile('audio/scene-0.wav')} />`                  |
| `<Img>`                                                                                              | image that is guaranteed loaded before the frame renders                            | `<Img src={staticFile('logo.png')} />`                             |
| `random(seed)`                                                                                       | deterministic pseudo-random number                                                  | `random('bar-' + i)`                                               |
| `<Composition id component durationInFrames fps width height defaultProps calculateMetadata schema>` | registers a renderable video in `Root.tsx`                                        | see below                                                            |
| `calculateMetadata`                                                                                  | async function on `<Composition>`that sets duration, size and props before render | section 9                                                            |
| `delayRender()`/`continueRender()`                                                                 | pause rendering until async work (a font, data) finishes                            | use sparingly                                                        |

**Default animation pattern.** `spring` with `damping: 200` for smooth entrances; `interpolate` with `extrapolateRight: 'clamp'` for counters and wipes; stagger by adding `delay = baseDelay + index * step`.

```tsx
const frame = useCurrentFrame();
const {fps} = useVideoConfig();
const p = spring({frame, fps, delay: 10 + i * 14, config: {damping: 200}}); // 0 -> 1
return <div style={{opacity: p, transform: `translateY(${(1 - p) * 40}px)`}} />;
```

**Composition registration**

```tsx
// src/Root.tsx
<Composition
  id="Video"
  component={Video}
  width={1920} height={1080} fps={30}
  durationInFrames={300}               // placeholder; calculateMetadata overrides it
  defaultProps={{scenes: []}}
  calculateMetadata={calculateMetadata}
/>
```

**Scene sequencing with transitions.** Use `<TransitionSeries>` from `@remotion/transitions`. Transitions overlap the neighbouring scenes, so total length = sum of scene durations minus sum of transition durations. Compute this in `calculateMetadata`.

```tsx
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}><SceneA/></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
  <TransitionSeries.Sequence durationInFrames={120}><SceneB/></TransitionSeries.Sequence>
</TransitionSeries>
```

If scenes are in a React list, wrap each pair in a keyed `<Fragment>`, as the test project does.

**Official agent help.** Remotion publishes agent skills and best-practice rules (repository `remotion-dev/skills`). The agent should check that repo's README and install or read those rules before writing new components; they stay current with Remotion releases.

## 7. Remotion packages and options available

The table lists what the agent can reach for. Install each with `npx remotion add <package>`. Before using any API not shown in this spec, the agent must read that package's page on [remotion.dev/docs](https://www.remotion.dev/docs) for the installed version, because signatures change between releases.

| Package                                         | What it gives you                                                                                                                                                                                                | Use it for                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@remotion/transitions`                       | `TransitionSeries`, timings `linearTiming`and `springTiming`, presentations such as `fade`,`slide`,`wipe`,`flip`,`clockWipe`(full list in docs); newer versions add `TransitionSeries.Overlay` | scene-to-scene transitions                                                                |
| `@remotion/shapes`                            | `Rect`,`Circle`,`Ellipse`,`Triangle`,`Star`,`Polygon`,`Pie`components, plus `make*`helpers that return SVG paths                                                                                 | icons, markers, donut and pie pieces, decorations                                         |
| `@remotion/paths`                             | `evolvePath`(draw a path on progressively),`getLength`,`getPointAtLength`,`interpolatePath`(morph one path into another),`scalePath`,`translatePath`,`getBoundingBox`                              | line charts that draw on, animated arrows, path morphs, an object travelling along a path |
| `@remotion/google-fonts`                      | typed `loadFont()`per font family, waits for the font before rendering                                                                                                                                         | consistent typography                                                                     |
| `@remotion/layout-utils`                      | `measureText`,`fitText`,`fillTextBox`                                                                                                                                                                      | making text fit its box without overflow                                                  |
| `@remotion/lottie`                            | `<Lottie animationData>`plays Lottie JSON, driven by the Remotion frame                                                                                                                                        | ready-made animated icons and illustrations (LottieFiles)                                 |
| `@remotion/captions`                          | a standard `Caption`type, SRT parsing,`createTikTokStyleCaptions`(word-by-word highlight pages)                                                                                                              | subtitles, spoken-word highlighting                                                       |
| `@remotion/install-whisper-cpp`               | local Whisper transcription with word timestamps                                                                                                                                                                 | getting word timings if the TTS does not return them                                      |
| `@remotion/noise`                             | `noise2D`,`noise3D`,`noise4D`                                                                                                                                                                              | gentle organic motion, drifting backgrounds                                               |
| `@remotion/motion-blur`                       | `Trail`,`CameraMotionBlur`                                                                                                                                                                                   | smoother fast movement                                                                    |
| `@remotion/light-leaks`                       | `LightLeak`overlay effect                                                                                                                                                                                      | optional polish between scenes                                                            |
| `@remotion/media-utils`                       | audio and video metadata, audio visualization                                                                                                                                                                    | audio waveforms (for durations prefer `ffprobe`, section 9)                             |
| `@remotion/animated-emoji`                    | animated emoji components                                                                                                                                                                                        | casual, friendly tone                                                                     |
| `@remotion/three`                             | Three.js scenes                                                                                                                                                                                                  | 3D scenes (heavy; avoid unless needed)                                                    |
| `@remotion/renderer`and `@remotion/bundler` | render from Node code:`bundle()`,`selectComposition()`,`renderMedia()`,`renderStill()`                                                                                                                   | the `make-video`CLI and a job service                                                   |
| `@remotion/lambda`and `@remotion/cloudrun`  | render in parallel on AWS Lambda or Google Cloud Run                                                                                                                                                             | scaling up later; not needed at the start                                                 |

**Presentations (transitions) to prefer.** `fade` as the default (safe, always readable); `slide` or `wipe` for process or timeline scenes; use at most two different transition types in one video. Keep transitions 10 to 15 frames.

**Non-Remotion libraries that work well**

* **lucide-react** : 1,000+ clean SVG icons as React components. Pick icons by name from the Lucide set.
* **D3 utilities** (`d3-scale`, `d3-shape`, `d3-array`): scales and line or area path generators. Use them for math only; render with plain SVG and drive animation from the frame.
* **Recharts** : usable, but its built-in animation must be turned off (`isAnimationActive={false}`) and revealed with frame-driven masks or clip paths. For simple bar charts, hand-written divs or SVG (as in the starter `chart` component) are easier and more predictable.
* **Tailwind CSS** : supported by `create-video`. Use it for layout and typography only, never for animation classes.
* **zod** : scene schema and `<Composition schema>` for typed props in Studio.

**Output options.** MP4 (`h264`, default), WebM (`vp8` or `vp9`, supports transparency), GIF, ProRes (for editing software), audio only, and image sequences. Choose with `--codec`. For social platforms keep MP4 h264 with `yuv420p` pixel format.

**Common composition sizes.** 1920x1080 (landscape, default), 1080x1920 (vertical Shorts, Reels), 1080x1080 (square). Supporting a second aspect ratio means components must adapt to `width` and `height` from `useVideoConfig()`; treat that as a separate milestone.

## 8. Animation recipes

Put these helpers in `src/anim.ts` and reuse them in every component, so all scenes move the same way.

**Shared entrance hook** (0 to 1 spring, starts after `delay` frames):

```ts
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
export const useIn = (delay = 0) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({frame: frame - delay, fps, config: {damping: 200}});
};
```

**Fade and slide up**

```tsx
const p = useIn(0);
<div style={{opacity: p, transform: `translateY(${(1 - p) * 40}px)`}} />
```

**Stagger a list** (each item starts 14 frames after the previous one):

```tsx
items.map((it, i) => <Item key={i} delay={14 + i * 14} text={it} />)
```

**Count-up number**

```tsx
const frame = useCurrentFrame();
const n = Math.round(interpolate(frame, [0, 45], [0, value], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)}));
```

**Bar or width growth** (multiply the final size by the 0 to 1 progress):

```tsx
const p = useIn(10 + i * 10);
<div style={{height: (value / max) * 520 * p}} />
```

**Draw a line or arrow on, using `@remotion/paths`**

```tsx
import {evolvePath} from '@remotion/paths';
const progress = interpolate(frame, [0, 40], [0, 1], {extrapolateRight: 'clamp'});
const {strokeDasharray, strokeDashoffset} = evolvePath(progress, path);
<path d={path} fill="none" stroke="#38bdf8" strokeWidth={8} strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
```

**Typewriter text**

```tsx
const chars = Math.floor(interpolate(frame, [0, text.length * 1.5], [0, text.length], {extrapolateRight: 'clamp'}));
<span>{text.slice(0, chars)}</span>
```

**Highlight the word being spoken** (needs word timings, section 9). Convert frame to seconds and compare:

```tsx
const t = frame / fps;
words.map((w, i) => <span key={i} style={{color: t >= w.start && t < w.end ? theme.accent : theme.text}}>{w.text} </span>)
```

**Pop or pulse emphasis** (a one-off scale bump when a value appears):

```tsx
const bump = spring({frame: frame - 30, fps, config: {damping: 8}}); // bouncy
const scale = 1 + 0.08 * bump * (1 - bump);
```

**Staying in sync with narration.** If the narration mentions three steps, show step 1 when the narrator reaches it, not all at once at frame 0. When word timings exist, set a component's `delay` values from the time each key word is spoken: `delay = Math.round(word.start * fps)`. Without word timings, spread entrances evenly across the first 60 percent of the scene's duration.

**Camera-like motion (optional).** A very slow scale from 1.00 to 1.04 over the whole scene (`interpolate(frame, [0, durationInFrames], [1, 1.04])`) keeps static layouts from feeling frozen.

**What to avoid.** More than three simultaneous moving things, fast spins, anything that moves after the narration has finished the key point, and long bounces. Smooth, short, and consistent beats flashy.

## 9. TTS integration and audio-synced timing

The user's TTS is **Kyutai Pocket TTS** (`pocket-tts` 4.0.1, about 100M parameters, CPU only, 24 kHz mono output, streaming, roughly 6x real time). The agent isolates it behind one function so the rest of the pipeline never depends on how it is called.

**What the user's installation supports (from the user's own report)**

* Predefined voices work. `alba` is the voice the user's other servers use, and `marius` also exists. Default narration voice: `alba`.
* **Voice cloning is not available.** The gated `kyutai/pocket-tts` repo is not in the user's Hugging Face cache, so the package fell back to `pocket-tts-without-voice-cloning` (`has_voice_cloning = False`). Passing a WAV file as a voice raises `VOICE_CLONING_UNSUPPORTED`. Cloning would need an `HF_TOKEN` with access to `kyutai/pocket-tts`. Do not build any feature that needs cloning.
* **The model is not thread-safe.** Synthesize one scene at a time (a lock or a plain sequential loop). Never run two synthesis jobs against the same model at once.
* **Load once, keep hot.** Loading the model and the voice state is slow. `quantize=True` is about 27% faster and uses about 48% less RAM.
* **Speed:** about 6x real time, so narration for a 60-second video takes roughly 10 seconds to generate. Streaming gives a first chunk in about 200 ms, which this pipeline does not need.
* **No word timestamps** are mentioned for this model, so assume none (see the word timestamp notes below).

**Four ways to call it:** the Python library, a packaged HTTP server, a CLI, and community JavaScript or WASM ports.

**Decision: use the packaged HTTP server.** Run `pocket-tts serve` once; the model stays hot between requests and any language can call it. The Node pipeline calls it over HTTP, with no Python inside the Node code.

```bash
pocket-tts serve        # keep running; listens on http://localhost:8000
curl -X POST localhost:8000/tts -F text="Hello" -F voice_url=alba -o speech.wav
```

It returns a chunked `audio/wav` stream. `voice_url` takes a built-in voice name or an `http://` or `hf://` URL. (The `voice_wav` upload field is for cloning and will not work here.)

**Fallback if the server misbehaves:** a small Python script, `pipeline/tts_batch.py`, using the library. It loads the model once and writes one WAV per scene from a JSON list of texts.

```python
from pocket_tts import TTSModel
import scipy.io.wavfile as wav

model = TTSModel.load_model()                      # quantize=True is optional
voice = model.get_state_for_audio_prompt('alba')   # predefined voice, no cloning
audio = model.generate_audio(voice, 'Hello world.')
wav.write('out.wav', model.sample_rate, audio.numpy())
```

The user's existing `tts-mcp/server.py` and `voice-chat/server.py` load their own copies of the model. The video pipeline should not call them; it should use `pocket-tts serve` so the two uses never contend for one model.

**Text hygiene before synthesis.** Pocket TTS reads text literally. Spell out symbols and abbreviations in `narration` (write "percent", not "%"; "for example", not "e.g."), keep sentences short, and keep each scene's narration under 400 characters. The user's `tts-mcp` server trims text at 1500 characters, so this limit is well inside it.

**Adapter contract (`pipeline/tts.ts`)**

```ts
// pipeline/tts.ts
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

export type Word = {text: string; start: number; end: number}; // seconds; Pocket TTS gives none
export interface TtsResult { file: string; durationSec: number; words?: Word[] }

const TTS_URL = process.env.TTS_URL ?? 'http://localhost:8000/tts';

export async function synthesize(text: string, outPath: string, opts: {voice?: string} = {}): Promise<TtsResult> {
  const form = new FormData();
  form.set('text', text);
  form.set('voice_url', opts.voice ?? 'alba');          // built-in voice name
  const res = await fetch(TTS_URL, {method: 'POST', body: form});
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const rawPath = outPath + '.raw.wav';
  await writeFile(rawPath, Buffer.from(await res.arrayBuffer()));

  // Re-encode: fixes the header of a streamed WAV, resamples 24 kHz to 48 kHz, mono, loudness-normalized.
  execFileSync('ffmpeg', ['-y', '-i', rawPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', outPath]);

  const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outPath]).toString().trim();
  return {file: outPath, durationSec: parseFloat(d)};
}
```

This adapter already performs steps 2 and 3 of the per-scene procedure below (normalize and measure). Call it for scenes one after another, never in parallel. Measure duration only from the re-encoded file, because a streamed WAV can carry a placeholder length in its header.

**Per-scene procedure (`pipeline/make-video.ts`)**

1. For each scene, call `synthesize(scene.narration, 'projects/<id>/audio/scene-N.wav')`. Cache by a hash of text, voice and speed so unchanged scenes are never re-synthesized.
2. Normalize loudness so all scenes sound alike: `ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 48000 -ac 1 out.wav`.
3. Measure length: `ffprobe -v error -show_entries format=duration -of csv=p=0 file.wav`. Use `ffprobe`, not browser APIs, so the number is exact and computed once.
4. Write `audioFile`, `audioSeconds` and optional `words` back into `scenes.json`, then compute `durationInFrames` (next).

**Duration formula.** Let `fps = 30`, transition `T = 12` frames, `LEAD = 16` frames (narration starts after the incoming transition finishes), `TAIL = 18` frames (narration ends before the outgoing transition starts):

```ts
const audioFrames = Math.ceil(audioSeconds * fps);
const durationInFrames = Math.max(60, LEAD + audioFrames + TAIL); // last scene: TAIL = 30
```

In the component tree, start each scene's audio at `LEAD`:

```tsx
<TransitionSeries.Sequence durationInFrames={s.durationInFrames}>
  <Comp {...s} />
  <Sequence from={16}><Audio src={staticFile(s.audioFile)} /></Sequence>
</TransitionSeries.Sequence>
```

**Total video length** = sum of all scene durations minus `T` times (number of scenes minus 1), because transitions overlap. Compute it in `calculateMetadata` so the Composition always matches the audio:

```ts
import type {CalculateMetadataFunction} from 'remotion';
export const calculateMetadata: CalculateMetadataFunction<VideoProps> = ({props}) => {
  const T = 12;
  const total = props.scenes.reduce((s, x) => s + x.durationInFrames, 0) - T * (props.scenes.length - 1);
  return {durationInFrames: total, props};
};
```

**Getting the audio files to Remotion.** `staticFile()` resolves against the `public` folder. For per-video folders either copy the audio into `public/projects/<id>/` before rendering, or pass `--public-dir=projects/<id>` on the render command and store paths as `audio/scene-N.wav`. Check `npx remotion render --help` for the installed version to confirm the flag. Pass the scene data with `--props=projects/<id>/scenes.json`; Remotion accepts a path to a JSON file.

**Word timestamps (optional, for highlights and tight sync)**

* Best: the TTS returns alignment. Store as `words: [{text, start, end}]` per scene, in seconds from the start of that scene's audio. Add `LEAD / fps` when converting to scene time.
* Fallback: run Whisper on each audio file with `@remotion/install-whisper-cpp` to get timestamps.
* Without timestamps: spread entrances evenly (section 8).

**Failure handling.** If the TTS fails for a scene, retry once; then stop the whole run with the scene index and keep completed audio in the cache. Never render a video with a missing narration file.

## 10. LLM script generation: prompt, output contract, retry loop

The user runs their own LLM. Wrap it in one function, `generateScript(concept, opts): Promise<string>` in `pipeline/llm.ts`, that takes a prompt and returns raw text. Everything else (parsing, validation, retries) lives in the pipeline, so the model can be swapped freely. **Open question for the user:** how is the LLM called (OpenAI-compatible HTTP, local runner, other), and does it support JSON mode or structured output? If it does, use it and still validate.

**Inputs to the prompt**

* `concept`: the user's topic, one line or a short paragraph.
* `targetSeconds`: default 60. Scene count is roughly `targetSeconds / 8`, clamped to 5 to 12.
* `audience` and `tone`: optional, for example "high-school students, friendly".
* The scene catalog and limits, generated from the zod schema (never hand-copied, so they cannot drift).

**Prompt template**

```text
You write scene scripts for short infographic explainer videos.

TOPIC: {concept}
AUDIENCE: {audience}      TARGET LENGTH: about {targetSeconds} seconds ({sceneCount} scenes)

Output ONLY valid JSON, no markdown fences, no commentary, in this shape:
{ "title": string, "scenes": [ ...scene objects... ] }

Allowed scene types and their fields (respect every length limit):
{generated catalog: type, fields, limits, when to use}

Rules:
1. First scene is a "title" scene. Last scene is a "bullets" or "title" scene that wraps up.
2. One idea per scene. Vary scene types; do not use the same type more than twice in a row.
3. "narration" is what a presenter says aloud: plain spoken sentences, 15 to 45 words, no emojis, no markdown, no abbreviations a voice would mispronounce.
4. On-screen text is short. It supports the narration; it does not repeat it word for word.
5. Numbers and statistics: use only figures that are well established or were given in the topic. If unsure, use a qualitative scene (flow or bullets) instead of inventing a number.
6. Do not include timing, durations, audio fields or any field not in the catalog.
```

**Writing guidance baked into the prompt.** Start with a hook, then explain in the order a beginner would need it (what, why, how, so what), and end with a short takeaway. Prefer concrete examples to definitions.

**Pipeline loop (`pipeline/make-video.ts`)**

```text
attempt = 0
raw = llm(prompt)
loop:
  result = validate(parseJson(raw))
  if result.ok: break
  attempt += 1
  if attempt > 2: fail with error list, save raw output to log.json
  raw = llm(prompt + previous output + "Fix these problems and return the full corrected JSON:\n" + result.errors)
```

Error messages sent back must be specific: `scenes[3].steps: must have at most 5 items (got 7)`, `scenes[0]: first scene must be type "title"`. Use low temperature (0.2 to 0.5) for reliable structure.

**Fact policy.** LLMs invent statistics. For `stat` and `chart` scenes, the agent should (a) log every number it contains in `log.json` as `claims`, and (b) support an optional `--data data.json` input where the user supplies real figures that the prompt must use. For anything the user will publish, a human should check the claims list before sharing.

**Edit flow.** To change a finished video, edit `projects/<id>/scenes.json` by hand or ask the LLM for a modified script given the existing one, then re-run only the changed steps: re-synthesize audio for scenes whose narration changed (cache handles this), then render again.

## 11. Rendering: commands, options, performance

**Commands**

```bash
npx remotion studio src/index.ts                         # live preview and scrubbing
npx remotion compositions src/index.ts                   # list composition ids
npx remotion still src/index.ts Video out/f.png --frame=60 --props=projects/x/scenes.json   # one frame
npx remotion render src/index.ts Video projects/x/video.mp4 --props=projects/x/scenes.json  # full video
```

**Useful render flags** (confirm with `npx remotion render --help` for the installed version)

| Flag                       | Effect                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--props=<file or json>` | passes scene data to the composition                                                                                                |
| `--concurrency=N`        | parallel browser tabs; cannot exceed the machine's CPU thread count (a value above it is rejected); default is about half the cores |
| `--scale=0.5`            | renders at half size (960x540): fast drafts                                                                                         |
| `--crf=N`                | h264 quality, lower is better and bigger; about 18 for final, 26 to 28 for drafts                                                   |
| `--image-format=jpeg`    | frames captured as JPEG instead of PNG: faster, fine for flat graphics and photos; use PNG only if you need transparency            |
| `--codec=h264`           | default MP4; also `vp8`,`vp9`,`prores`,`gif`                                                                                |
| `--frames=0-59`          | render only a range, for checking a scene                                                                                           |
| `--public-dir=<dir>`     | folder that `staticFile()`resolves against                                                                                        |
| `--muted`                | render without audio                                                                                                                |
| `--timeout=<ms>`         | how long to wait for `delayRender`(fonts, data) before failing                                                                    |
| `--log=verbose`          | detailed logs for debugging                                                                                                         |

**Draft versus final**

* Draft: `--scale=0.5 --crf=28 --image-format=jpeg`. Use it for review.
* Final: default 1920x1080, `--crf=18`. Same scenes JSON and audio, so the draft is a faithful preview.

**Programmatic rendering (used by the CLI and any service).** Bundle once, then render many videos from the same bundle; bundling is the slow part and does not depend on the scene data.

```ts
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')}); // once per process

export async function render(id: string, inputProps: object, out: string, draft = false) {
  const composition = await selectComposition({serveUrl, id: 'Video', inputProps}); // runs calculateMetadata
  await renderMedia({
    composition, serveUrl, inputProps,
    codec: 'h264',
    outputLocation: out,
    scale: draft ? 0.5 : 1,
    crf: draft ? 28 : 18,
    concurrency: 2,
    onProgress: ({progress}) => console.log(Math.round(progress * 100) + '%'),
  });
}
```

If using per-video public folders, check that `bundle()` accepts a `publicDir` option in the installed version, or copy the audio into the project's `public/` folder before bundling.

**Performance**

* Measured on the starter project: a 492-frame (about 16 s) 1080p video rendered in about 47 s on a 2-vCPU container. Expect roughly 3x video length on two cores, faster with more.
* Rendering cost scales with frames times scene complexity. Avoid large blurs, many box-shadows, big SVG filters, and thousands of DOM nodes.
* Run one render at a time per machine, with concurrency equal to the thread count. For many videos at once, add machines (or Remotion Lambda) rather than raising concurrency.
* Cache everything that is expensive and deterministic: LLM script by (concept, settings), audio by text hash.
* Always check a single frame with `still` after changing a component; never render the whole video to test a layout.

## 12. The make-video CLI and the optional job service

**Command**

```bash
npm run make -- --concept "How vaccines work" --id vaccines-01 [options]
```

| Option                    | Default                           | Meaning                                                                 |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `--concept`             | required unless `--from-scenes` | the topic text                                                          |
| `--id`                  | slug of concept plus date         | folder name under `projects/`                                         |
| `--seconds`             | 60                                | target video length, guides scene count                                 |
| `--audience`,`--tone` | none                              | passed into the LLM prompt                                              |
| `--data`                | none                              | JSON file of real figures the script must use                           |
| `--from-scenes`         | none                              | skip the LLM; use an existing `scenes.json`(for edits and re-renders) |
| `--draft`               | off                               | 720p-equivalent fast render (section 11)                                |
| `--stop-after`          | none                              | `script`,`audio`or `render`; stop early to review                 |
| `--voice`,`--speed`   | TTS defaults                      | passed to the TTS adapter                                               |
| `--force`               | off                               | ignore caches and redo every step                                       |

**Steps, in order, each skippable if its output already exists and inputs are unchanged**

1. Create `projects/<id>/`, save `concept.txt`.
2. Generate and validate the script, save `scenes.json` (section 10).
3. Synthesize audio per scene, normalize, measure, update `scenes.json` with timings (section 9).
4. Render to `projects/<id>/video.mp4` (section 11).
5. Write `log.json`: start and end times per step, retries used, TTS and render durations, list of `claims` from stat and chart scenes, any warnings.
6. Print the output path and total length. Exit code 0 on success; non-zero with a one-line reason on failure.

**Behavior rules**

* Idempotent: running the same command twice does not redo finished steps.
* Atomic output: render to `video.tmp.mp4`, then rename to `video.mp4` when done, so a crash never leaves a half-written file that looks finished.
* Never overwrite another video's folder. If `--id` exists and `--force` is absent, resume it.
* Log progress as plain lines (`[script] ok 8 scenes`, `[audio] 5/8`, `[render] 63%`), so an agent or a person can follow along.

**As an agent tool.** Expose one tool, `make_video(concept, seconds?, draft?)`, that shells out to this CLI and returns the output path or the error line. The agent's job is to pick good concepts and parameters, not to touch Remotion code.

**Optional job service (only when needed)**

Build this only if videos must be requested from a web page, bot or other program, or queued in bulk. Rendering takes a minute or more, so it must be an asynchronous job, never a request that waits.

| Endpoint                                                 | Behavior                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `POST /videos`with `{concept, seconds, draft}`       | creates a job, returns `{id, status: "queued"}`immediately                                                                   |
| `GET /videos/:id`                                      | returns `{status, step, progress, error?}`; status is `queued`,`scripting`,`audio`,`rendering`,`done`or `failed` |
| `GET /videos/:id/file`                                 | streams the MP4 when done                                                                                                      |
| `GET /videos/:id/scenes`and `PUT /videos/:id/scenes` | read and edit the scene JSON, then `POST /videos/:id/rerender`                                                               |

Implementation: a queue (a SQLite table or BullMQ with Redis) and one worker that runs the same pipeline functions as the CLI, with a render concurrency of one job at a time per machine. Keep the CLI as the source of truth; the service only wraps it.

## 13. Testing, QA checklist and troubleshooting

**How the agent verifies its own work.** A video cannot be "unit tested" by reading code. After every component change or full run, render stills at key frames (the end of each entrance animation and the middle of each scene) and look at them. A frame where text runs off the edge, overlaps, or is unreadable is a failure even if the render succeeded.

**Acceptance checklist (run for every new component and for the first end-to-end video)**

* `npm run dev` opens Studio and all scene types preview without console errors.
* Each component renders correctly at frame 0, at the end of its entrance, and at the last frame (still images checked).
* Text at maximum allowed length (schema limits) still fits inside the frame with no overflow.
* Text at minimum length still looks balanced.
* `scenes.json` validation rejects: wrong type, missing field, too many items, over-long text, wrong first scene.
* Retry loop fixes a deliberately broken LLM output within two attempts, and fails cleanly on a third bad output.
* Each narration file exists, is mono, loudness normalized, and its measured duration matches the scene length plus lead and tail.
* No scene's audio is cut off by a transition; no long silences between scenes.
* Total composition length equals the sum of scene durations minus transition overlaps.
* Draft and final renders both succeed; final is 1920x1080 at 30 fps.
* Running the same command twice does not redo finished steps; `--force` does.
* A failed run leaves no file named `video.mp4`.
* `log.json` lists retries, timings and the numbers used in stat and chart scenes.
* Playing the final MP4 in a normal player (not only Studio) shows audio and video in sync.

**Troubleshooting**

| Symptom                             | Likely cause                                                                   | Fix                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Fallback font in the render         | font not loaded before the frame                                               | load fonts with `@remotion/google-fonts` `loadFont()`or use `delayRender`until loaded      |
| Flickering or jumping elements      | CSS transition, CSS animation or `Math.random()`used                         | replace with frame-driven `interpolate`/`spring`and `random(seed)`                         |
| Error about mismatched versions     | `remotion`and `@remotion/*`versions differ or have `^`                   | pin all to the same exact version; reinstall with `npx remotion add`                           |
| `--concurrency`rejected           | value above the CPU thread count                                               | lower it to the thread count or less                                                             |
| Render hangs and then times out     | a `delayRender()`never calls `continueRender()`, or an asset fails to load | fix the asset path; raise `--timeout`only if the work is genuinely slow                        |
| Audio missing in the output         | wrong `staticFile`path,`public-dir`not set, or `--muted`set              | check the file exists where `staticFile`resolves; check flags                                  |
| Narration cut off at scene end      | scene duration shorter than audio plus lead                                    | recompute durations from the measured audio length (section 9)                                   |
| Chrome cannot start in a container  | missing browser or sandbox restrictions                                        | point `Config.setBrowserExecutable`at an installed Chrome; use software GL (section 3)         |
| Text overflows its box              | scene text longer than the design assumed                                      | tighten the schema limit, or use `@remotion/layout-utils` `fitText`                          |
| Very slow renders                   | heavy effects, huge DOM, high resolution                                       | simplify the component; use `--scale`for drafts; check the busiest frame with `still`        |
| LLM returns invalid JSON every time | model ignores format                                                           | enable JSON or structured output mode; lower temperature; include one full example in the prompt |

## 14. Milestones and acceptance gates

[embed: node/6511c3e2-af8d]

The agent works in this order and must show the evidence for each gate (still images, a log, or a test video) before starting the next milestone. M1 already exists as a working prototype; the agent should reproduce it from this spec and confirm it renders.

**How the agent should report.** After each milestone: what was built, the evidence for the gate, and what is next, in a few lines. Stop and ask the user only for the open questions below; decide everything else using this spec.

**Open questions for the user (needed for M3)**

* How is the LLM called (endpoint and request format, or local command), and does it support JSON mode?
* Which Pocket TTS voice should narration use? Default is alba; marius also exists. Voice cloning is not available on this install.
* Word-by-word highlighting needs a Whisper pass, since Pocket TTS gives no timestamps. Do you want highlights, or skip them?
* Target video length and audience for the first real videos (default: 60 seconds, general audience).
* Output language of the narration (affects fonts and text-fit limits).

**Sources used for the Remotion details in this spec:** [Remotion API overview](https://remotion.dev/docs/api), [transitions](https://remotion.dev/docs/transitions), [calculateMetadata](https://www.remotion.dev/docs/calculate-metadata), [captions](https://remotion.dev/docs/captions/api). The agent must still confirm exact signatures against the installed version's documentation.
