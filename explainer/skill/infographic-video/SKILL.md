---
name: infographic-video
description: Make a short narrated infographic explainer video (30-90 s) from a concept. Use when the user asks for an explainer/infographic video. You agree a brief and outline with the user, write one scenes.json, and two scripts do the rest (voice, timings, render) and print the video path.
---

# Infographic video

Goal: explain **one idea** clearly and briefly, not show off every scene type.
A good video is a short story with one main picture. Script paths are relative to this skill folder.

## Steps
1. **Brief** (ask only what the user has not already told you; offer defaults so they can answer in one line):
   - Length: 30, 60 (default) or 90 seconds?
   - Audience and depth: beginner / general (default) / technical?
   - Look: simple and visual (default) or detailed?
   - Subtitles? Off by default. If yes, add `"captions": true` at the top of `scenes.json` (next to `"title"`): a `video.srt` file is written next to the video (same name, so players load it as a subtitle track). Captions are NOT burned into the video. Nothing else to write.
2. **Spine**: say the whole idea in ONE sentence ("a request passes four checks, then runs"). Decide the one visual that carries it (usually a `flow`, or a `stat` hook). Every other scene supports that one.
3. **Outline**: show the user a list, one line per scene, and **wait for their OK or edits**:
   `1 title | 2 stat: the hook number | 3 flow: the four steps | 4 bullets: takeaway`
4. Write `scenes.json` (format below) anywhere, e.g. `/tmp/scenes.json`.
5. `scripts/draft.sh /tmp/scenes.json [project_id]` - 1 to 3 minutes: **run in the background or with a 10 minute timeout.**
   - Errors: it prints every validator error. Fix **all** in one pass, run again (max 2 fixes, then show the user the errors).
   - To fix a scene after a draft, pass the same `project_id` it printed: unchanged narration is reused and the redraft is much faster.
   - Success prints `project_id`, `draft_video`, `contact_sheet`.
6. Open the `contact_sheet` image and check for overflow, overlap, edges crossing text. Fix once, then tell the user what you see.
7. **STOP. Wait for the user's explicit OK.** Never run `final.sh` without it.
8. `scripts/final.sh <project_id>` (about 2 minutes, same timeout advice) prints `final_video: <path>`. Give it to the user.

## How to design the infographic (this is the job)
**Budget (hard cap unless the user asks for more):**

| Length | Scenes | Narration total |
|---|---|---|
| 30 s | 3-4 | about 75 words |
| 60 s | 5-6 | about 150 words |
| 90 s | 7-8 | about 225 words |

Speech runs about 2.5 words per second. A simple topic gets the short end.

**Pick the scene from the shape of the idea, not from what is available:**

| The idea is... | Use | Do NOT use when |
|---|---|---|
| the opening / the closing | `title` first, `bullets` last (3-4 takeaways) | |
| a surprising number | `stat` (one number, one label) | there is no real, sourced number |
| a few numbers to compare | `chart` (2-5 bars) | you only have one number (use `stat`) |
| steps in order, a process, cause then effect | `flow` (3-5 short steps) | steps branch or loop (use `graph`) |
| a real decision with branches or a loop | `graph` | it is a straight line (use `flow`) |
| several parties exchanging messages | `sequence` | only two parties or no back-and-forth |
| options compared on 2+ dimensions | `table` | it is a plain list (use `bullets`) |
| something that happened on dates | `timeline` | there are no real dates or stages |
| the user wants to read code | `code` | the idea can be said without code |
| a short list of points | `bullets` | there are more than 5 (cut, or split) |

**Default kit:** title, flow, bullets, plus a stat/chart if there is a real number. Most videos need nothing else.
A special type (graph, sequence, table, code, timeline) must **earn its place**: use one only when the content really has that shape, at most one scene of each, and at most **two** special types per video. A simple topic is just title + flow + stat + bullets.

**Make it read well:**
- One idea per scene. The screen shows keywords; the narration says the sentence. Never put the narration text on screen.
- Short, parallel on-screen phrases ("Boil water", "Add tea"), not sentences.
- Open with a hook (a title, or a stat that makes the viewer care), end with the takeaway.
- Vary the rhythm: do not use the same type twice in a row if you can avoid it.
- Prefer a clean 4-step `flow` over a clever 10-node graph. If it does not fit simply, cut detail: put the detail in the narration.

**Graph rules (the auto-layout breaks otherwise):** at most 6 nodes, at most 2 edges into any one node, short labels (<=14 chars), edge labels <=6 chars, no single "refuse/fail" node that many nodes point to (merge the checks into one decision node instead). Prefer a mostly straight chain with one branch.

## scenes.json
```json
{"title": "Short name", "captions": false, "scenes": [ ...3 to 8 scenes... ]}   // "captions": true only if the user wants subtitles
```
Every scene has `"type"`, and **either** a scene-level `"narration"` (12-60 words) **or** `"steps"`, each with its own `"narration"` (6-40 words). Never both.
**Structure (validator):** first scene a `title`; last a `title` or `bullets`; the same type at most twice in a row; at least 3 scenes.

| type | fields (limits) |
|---|---|
| title | `text` (<=60), `subtitle` (<=90), `narration` |
| bullets | `title`, `items`[] + `narration`, **or** `steps`[{`item`, `narration`}] - max 5, item <=48 chars |
| flow | `title`, `steps`[{`item`, `narration`}] - 2 to 5 steps, item <=24 chars |
| stat | `value` (a **number**), `suffix` (<=4, e.g. "%"), `label` (<=60), `narration` |
| chart | `title`, `data`[{`label`, `value`(number)}] 2-5 bars, `narration` |
| graph | `title`, `direction` "LR", `nodes`[{`id`,`label`,`kind`: start/process/decision/end}] 2-10, `edges`[{`from`,`to`,`label`?}] <=14, labels <=24, `steps`[{`focus`: [node ids], `narration`}] |
| code | `title`, `lang`, `code` (verbatim, <=12 lines x <=60 chars), `steps`[{`lines`: [line numbers, 1-based **array**], `narration`}] - together cover every line |
| table | `title`, `columns` 2-4 (<=20 chars), `rows` <=6 x cols (cells <=36; exactly "yes"/"no" shows an icon), `steps`[{`row` **or** `col` (1-based), `narration`}] 2-8 |
| sequence | `title`, `actors`[{`id`,`label`<=14}] 2-5, `messages`[{`from`,`to`,`label`<=32}] 2-8, `steps`[{`toMessage` (1-based, increasing, last = final message), `narration`}] |
| timeline | `title`, `steps`[{`when`,`label`,`detail`,`narration`}] |

`flow`/`bullets` steps: max 5. Every other type with `steps`: 2 to 8.

## Narration rules (the validator rejects violations)
- Plain spoken English, one idea per scene.
- **No digits, `%`, `&`, "e.g.", "i.e.", "etc."** - write "ninety five percent", "and", "for example".
- Never invent numbers for stat/chart scenes; use only what the user gave you, with its source.

## Never write these (the pipeline adds them)
`audioSeconds`, `audioFile`, `words`, `durationInFrames`, `tokens`, `trace`, `traceHash`, `codeHash`.
Do not use `trace` scenes. Never run `npm run make` with `--force`.

## Minimal example (a simple topic: 4 scenes, 3 types)
```json
{"title": "Tea", "scenes": [
 {"type": "title", "text": "How Tea Works", "subtitle": "A quick guide",
  "narration": "Here is a quick guide to making a proper cup of tea, one short step at a time."},
 {"type": "flow", "title": "The method", "steps": [
   {"item": "Boil water", "narration": "First, bring fresh water to a rolling boil."},
   {"item": "Add tea", "narration": "Next, add one spoon of tea leaves for each cup."},
   {"item": "Steep and serve", "narration": "Finally, let it steep three minutes, then pour and enjoy."}]},
 {"type": "stat", "value": 3, "suffix": "min", "label": "ideal steeping time",
  "narration": "Three minutes is the sweet spot, because longer than that and the tea turns bitter."},
 {"type": "bullets", "title": "Remember", "items": ["Fresh water", "One spoon per cup", "Three minutes"],
  "narration": "Remember the three basics: fresh water, one spoon of leaves per cup, and three minutes of steeping."}
]}
```
