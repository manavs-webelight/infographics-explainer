// Single source of truth for the scene JSON (spec section 4 + M5 step-level
// narration). The LLM-era rule stands: timing/audio fields are set by the
// pipeline only, never hand-written.
//
// A scene uses EXACTLY ONE of:
//   - one scene-level `narration` (classic), or
//   - `steps: [{narration, ...highlight fields}]` (2-8 steps, 6-40 words each;
//     flow/bullets capped at 5 by on-screen item limits) - enforced by the
//     validator's semantic checks.
import {z} from 'zod';

// Audio/timing fields the pipeline may write anywhere audio exists.
const stepTiming = {
  audioFile: z.string().optional(), // audio/scene-N-step-M.wav (pipeline)
  audioSeconds: z.number().optional(), // pipeline
  startFrame: z.number().int().min(0).optional(), // relative to scene start (pipeline)
  frames: z.number().int().positive().optional(), // step audio in frames (pipeline)
};

const base = {
  narration: z.string().min(10).max(400).optional(), // classic narration
  durationInFrames: z.number().int().positive().optional(), // pipeline
  audioSeconds: z.number().optional(), // pipeline
  words: z
    .array(z.object({text: z.string(), start: z.number(), end: z.number()}))
    .optional(), // reserved (Whistle is audibility-check only)
  audioFile: z.string().optional(), // pipeline, classic scenes
};

const narrationStr = z.string().min(10).max(400);

export const FlowStepSchema = z.object({
  item: z.string().min(1).max(24),
  narration: narrationStr,
  ...stepTiming,
});

export const BulletStepSchema = z.object({
  item: z.string().min(1).max(48),
  narration: narrationStr,
  ...stepTiming,
});

// M6 graph scene. Steps REQUIRED (each step focuses nodes/edges); a graph
// scene must not use a scene-level narration (checked semantically).
export const GraphNodeSchema = z.object({
  id: z.string().min(1).max(20),
  label: z.string().min(1).max(24),
  kind: z.enum(['start', 'process', 'decision', 'end']),
});

export const GraphEdgeSchema = z.object({
  from: z.string().min(1).max(20),
  to: z.string().min(1).max(20),
  label: z.string().max(12).optional(),
});

export const GraphStepSchema = z.object({
  narration: narrationStr,
  focus: z.array(z.string().min(1).max(44)).min(1).max(20),
  ...stepTiming,
});

export const GraphSceneSchema = z.object({
  type: z.literal('graph'),
  title: z.string().max(50).optional(),
  direction: z.enum(['LR', 'TB']).optional(),
  nodes: z.array(GraphNodeSchema).min(2).max(10),
  edges: z.array(GraphEdgeSchema).min(1).max(14),
  steps: z.array(GraphStepSchema).min(2).max(8),
  durationInFrames: z.number().int().positive().optional(),
  audioSeconds: z.number().optional(),
  audioFile: z.string().optional(),
  words: z
    .array(z.object({text: z.string(), start: z.number(), end: z.number()}))
    .optional(),
});

// M7 code-walkthrough scene. Steps REQUIRED (each focuses line numbers,
// 1-based). Syntax colors are pre-tokenized by the pipeline (shiki) and
// injected as an opaque "tokens" field - never authored by hand.
export const CodeStepSchema = z.object({
  narration: narrationStr,
  lines: z.array(z.number().int().min(1).max(99)).min(1).max(12),
  ...stepTiming,
});

export const CodeSceneSchema = z.object({
  type: z.literal('code'),
  title: z.string().max(50).optional(),
  lang: z.enum(['python', 'javascript', 'typescript', 'json', 'bash']),
  code: z.string().min(1),
  steps: z.array(CodeStepSchema).min(2).max(8),
  tokens: z.unknown().optional(),
  codeHash: z.string().optional(),
  durationInFrames: z.number().int().positive().optional(),
  audioSeconds: z.number().optional(),
  audioFile: z.string().optional(),
  words: GraphSceneSchema.shape.words,
});

// M8 trace scene: replays REAL recorded states (sys.settrace via
// pipeline/trace.ts). The "trace"/"traceHash" fields are pipeline-injected;
// hand-authored values are rejected by the stale-input check (validator).
export const TraceStepSchema = z.object({
  narration: narrationStr,
  toState: z.number().int().min(1).max(99),
  ...stepTiming,
});

export const TraceSceneSchema = z.object({
  type: z.literal('trace'),
  title: z.string().max(50).optional(),
  lang: z.enum(['python', 'javascript', 'typescript', 'json', 'bash']),
  code: z.string().min(1),
  source: z.string().min(1).max(80),
  entry: z.string().min(1).max(40),
  args: z.string().min(1).max(60),
  steps: z.array(TraceStepSchema).min(2).max(8),
  trace: z.unknown().optional(),
  traceHash: z.string().optional(),
  tokens: CodeSceneSchema.shape.tokens,
  durationInFrames: z.number().int().positive().optional(),
  audioSeconds: z.number().optional(),
  audioFile: z.string().optional(),
  words: GraphSceneSchema.shape.words,
});

// Table scene (comparison / matrix). The whole table is visible from the first
// frame; each step focuses a data row, a column, or one cell (row + col, both
// 1-based; column 1 is the row-label column). At least one of row/col per step
// (checked semantically). Scene-level narration is not allowed: steps only.
// A cell that is exactly "yes" or "no" renders a check or dash icon.
export const TableStepSchema = z.object({
  narration: narrationStr,
  row: z.number().int().min(1).max(6).optional(),
  col: z.number().int().min(1).max(4).optional(),
  ...stepTiming,
});

export const TableSceneSchema = z.object({
  type: z.literal('table'),
  title: z.string().max(50).optional(),
  columns: z.array(z.string().min(1).max(20)).min(2).max(4),
  rows: z.array(z.array(z.string().min(1).max(36)).min(2).max(4)).min(2).max(6),
  steps: z.array(TableStepSchema).min(2).max(8),
  durationInFrames: z.number().int().positive().optional(),
  audioSeconds: z.number().optional(),
  audioFile: z.string().optional(),
  words: GraphSceneSchema.shape.words,
});

// Sequence diagram scene: actors across the top, messages in time order.
// Each step reveals every message up to toMessage (1-based, strictly
// increasing; the last step must reach the final message - semantic check).
// Label length is limited by the distance between the two lifelines; the
// validator uses the shared src/sequence-layout.ts to enforce that.
export const SequenceActorSchema = z.object({
  id: z.string().min(1).max(20),
  label: z.string().min(1).max(14),
});

export const SequenceMessageSchema = z.object({
  from: z.string().min(1).max(20),
  to: z.string().min(1).max(20),
  label: z.string().min(1).max(32),
});

export const SequenceStepSchema = z.object({
  narration: narrationStr,
  toMessage: z.number().int().min(1).max(8),
  ...stepTiming,
});

export const SequenceSceneSchema = z.object({
  type: z.literal('sequence'),
  title: z.string().max(50).optional(),
  actors: z.array(SequenceActorSchema).min(2).max(5),
  messages: z.array(SequenceMessageSchema).min(2).max(8),
  steps: z.array(SequenceStepSchema).min(2).max(8),
  durationInFrames: z.number().int().positive().optional(),
  audioSeconds: z.number().optional(),
  audioFile: z.string().optional(),
  words: GraphSceneSchema.shape.words,
});

// Timeline scene: events along a horizontal axis, alternating above and below.
// Each STEP is one event (when + label + optional detail) with its own
// narration, so every event is explained by construction. 2-6 events.
export const TimelineStepSchema = z.object({
  when: z.string().min(1).max(14),
  label: z.string().min(1).max(36),
  detail: z.string().min(1).max(48).optional(),
  narration: narrationStr,
  ...stepTiming,
});

export const TimelineSceneSchema = z.object({
  type: z.literal('timeline'),
  title: z.string().max(50).optional(),
  steps: z.array(TimelineStepSchema).min(2).max(6),
  durationInFrames: z.number().int().positive().optional(),
  audioSeconds: z.number().optional(),
  audioFile: z.string().optional(),
  words: GraphSceneSchema.shape.words,
});

export const SceneSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    narration: narrationStr, // title scenes always carry one narration
    type: z.literal('title'),
    text: z.string().max(60),
    subtitle: z.string().max(90).optional(),
  }),
  z.object({
    ...base,
    narration: narrationStr, // stat scenes always carry one narration
    type: z.literal('stat'),
    value: z.number(),
    suffix: z.string().max(4).optional(),
    label: z.string().max(60),
  }),
  z.object({
    ...base,
    narration: narrationStr, // chart scenes always carry one narration
    type: z.literal('chart'),
    title: z.string().max(50),
    data: z
      .array(z.object({label: z.string().max(12), value: z.number()}))
      .min(2)
      .max(6),
  }),
  z.object({
    ...base,
    // classic: steps are plain strings + scene-level narration
    // stepped: steps are objects with their own narration (no scene narration)
    type: z.literal('flow'),
    title: z.string().max(50).optional(),
    steps: z.union([
      z.array(z.string().max(24)).min(2).max(5),
      z.array(FlowStepSchema).min(2).max(5),
    ]),
  }),
  z.object({
    ...base,
    // classic: `items` strings + scene-level narration
    // stepped: `steps` objects with their own narration (no items, no narration)
    type: z.literal('bullets'),
    title: z.string().max(50),
    items: z.array(z.string().max(48)).min(2).max(5).optional(),
    steps: z.array(BulletStepSchema).min(2).max(5).optional(),
  }),
  GraphSceneSchema,
  CodeSceneSchema,
  TraceSceneSchema,
  TableSceneSchema,
  SequenceSceneSchema,
  TimelineSceneSchema,
]);

export const ScriptSchema = z.object({
  title: z.string(),
  captions: z.boolean().optional(), // write a video.srt next to the video (not burned in)
  scenes: z.array(SceneSchema).min(3).max(14),
});

export type Scene = z.infer<typeof SceneSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphStep = z.infer<typeof GraphStepSchema>;
export type CodeStep = z.infer<typeof CodeStepSchema>;
export type BulletStep = z.infer<typeof BulletStepSchema>;
export type TableStep = z.infer<typeof TableStepSchema>;
export type SequenceStep = z.infer<typeof SequenceStepSchema>;
export type TimelineStep = z.infer<typeof TimelineStepSchema>;

// Scene type names, for error messages and the catalog.
export const sceneTypes = SceneSchema.options.map((o) => o.shape.type.value);

export const isStepped = (scene: {steps?: unknown}): boolean =>
  Array.isArray(scene.steps) && typeof scene.steps[0] === 'object';
