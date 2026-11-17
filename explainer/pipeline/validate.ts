// Scene script validation (spec sections 4 and 10).
// Library: validateScript(rawJsonString) -> {ok, errors, data}
// CLI:     node pipeline/validate.ts <path-to-scenes.json>
//          exit 0 = valid; exit 1 = errors, one per line in section-10 format,
//          e.g.  scenes[3].steps: must have at most 5 items (got 7)
//          exit 2 = usage / unreadable file.
import {readFileSync} from 'node:fs';
import {ScriptSchema} from '../schema/scene-schema.ts';
import {fitAdvice, MIN_FONT, type LayoutNode, type LayoutEdge} from '../src/graph-layout.ts';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;
type PathSeg = string | number;
type Issue = {
  code?: string;
  message?: string;
  path?: PathSeg[];
  origin?: string;
  maximum?: number;
  minimum?: number;
  received?: unknown;
  expected?: string;
  note?: string;
  options?: unknown[];
  errors?: Issue[][];
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  data?: Record<string, unknown>;
}

// Step 1 of validation: parse JSON, tolerating code fences / surrounding prose.
function parseMaybeWrapped(raw: string): {value?: unknown; error?: string} {
  try {
    return {value: JSON.parse(raw)};
  } catch (e) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return {value: JSON.parse(raw.slice(start, end + 1))};
      } catch {
        // fall through
      }
    }
    return {error: `[input]: not valid JSON (${(e as Error).message})`};
  }
}

function getPath(obj: unknown, path: PathSeg[]): unknown {
  let v = obj;
  for (const seg of path) {
    if (v == null) return undefined;
    v = (v as Record<PathSeg, unknown>)[seg];
  }
  return v;
}

function fmtPath(path: PathSeg[]): string {
  let s = '';
  for (const seg of path) {
    if (typeof seg === 'number') s += `[${seg}]`;
    else s += s === '' ? seg : `.${seg}`;
  }
  return s;
}

// Convert one zod issue into one or more section-10-style messages.
function fmtIssue(issue: Issue, data: unknown): string[] {
  const path = issue.path ?? [];
  const p = fmtPath(path);
  switch (issue.code) {
    case 'invalid_union': {
      if (issue.note === 'No matching discriminator') {
        const actual = getPath(data, path);
        const owner = fmtPath(path.slice(0, -1));
        const allowed = (issue.options ?? []).join(', ');
        return [`${owner}: unknown scene type "${String(actual)}" (allowed: ${allowed})`];
      }
      if (Array.isArray(issue.errors) && issue.errors.length) {
        // Inner unions (e.g. classic vs stepped `steps`): report the option
        // that fits best (fewest sub-errors) so messages stay clear.
        const groups = issue.errors.filter((g) => Array.isArray(g) && g.length);
        const best = groups.length
          ? groups.reduce((a, b) => (b.length < a.length ? b : a))
          : [];
        const out: string[] = [];
        for (const sub of best) {
          out.push(...fmtIssue({...sub, path: [...path, ...(sub.path ?? [])]}, data));
        }
        if (out.length) return [...new Set(out)];
      }
      return [`${p}: ${issue.message ?? 'invalid scene'}`];
    }
    case 'too_big': {
      const v = getPath(data, path);
      const n =
        issue.received ??
        (Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : undefined);
      if (issue.origin === 'array')
        return [`${p}: must have at most ${issue.maximum} items (got ${String(n)})`];
      if (issue.origin === 'string')
        return [`${p}: must be at most ${issue.maximum} characters (got ${String(n)})`];
      return [`${p}: must be at most ${issue.maximum} (got ${String(n)})`];
    }
    case 'too_small': {
      const v = getPath(data, path);
      const n =
        issue.received ??
        (Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : undefined);
      if (issue.origin === 'array')
        return [`${p}: must have at least ${issue.minimum} items (got ${String(n)})`];
      if (issue.origin === 'string')
        return [`${p}: must be at least ${issue.minimum} characters (got ${String(n)})`];
      return [`${p}: must be at least ${issue.minimum} (got ${String(n)})`];
    }
    case 'invalid_type': {
      if (issue.received === undefined)
        return [`${p}: required field missing (expected ${issue.expected})`];
      return [`${p}: expected ${issue.expected}, got ${issue.received}`];
    }
    default:
      return [`${p}: ${issue.message ?? 'invalid value'}`];
  }
}

import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve, relative, isAbsolute} from 'node:path';

const codeLines = (s: Record<string, unknown>): string[] =>
  String(s.code ?? '').replace(/\s+$/, '').split('\n');

const checkCodeSize = (
  s: Record<string, unknown>,
  owner: string,
  errors: string[],
): void => {
  const lines = codeLines(s);
  if (lines.length > 12)
    errors.push(`${owner}.code: ${lines.length} lines of code, but at most 12 fit on screen (split into two scenes)`);
  lines.forEach((ln, k) => {
    if (ln.length > 60)
      errors.push(`${owner}.code line ${k + 1}: ${ln.length} characters, at most 60 fit on screen`);
  });
};

function walkStrings(value: unknown, pathStr: string, found: string[]): void {
  if (typeof value === 'string') {
    if (value.trim() === '') found.push(`${pathStr || 'value'}: empty string`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${pathStr}[${i}]`, found));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // shiki's pre-tokenized payload may legitimately contain empty indent
      // runs; it is pipeline-generated, never authored narration text.
      if (k === 'tokens') continue;
      walkStrings(v, pathStr ? `${pathStr}.${k}` : k, found);
    }
  }
}

// Pocket TTS reads narration literally: no symbols, abbreviations or digits
// (spec section 9, text hygiene; user decision for M3).
const FORBIDDEN_IN_NARRATION: Array<[RegExp, string]> = [
  [/%/, 'found "%", write "percent"'],
  [/&/, 'found "&", write "and"'],
  [/\be\.?g\./i, 'found "e.g.", write "for example"'],
  [/\bi\.?e\./i, 'found "i.e.", write "that is"'],
  [/\betc\./i, 'found "etc.", write "and so on"'],
];

function hygieneErrors(narration: string, pathStr: string): string[] {
  const errors: string[] = [];
  for (const [re, fix] of FORBIDDEN_IN_NARRATION) {
    if (re.test(narration))
      errors.push(`${pathStr}.narration: spell it out for the voice — ${fix}`);
  }
  const numbers = [...new Set(narration.match(/\d+(?:[.,]\d+)*/g) ?? [])];
  for (const num of numbers)
    errors.push(
      `${pathStr}.narration: spell it out for the voice — found number "${num}", write it as words`,
    );
  return errors;
}

// Semantic checks (spec section 4, step 3 + narration hygiene), run after the zod parse passes.
export function semanticErrors(script: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const scenes = script.scenes as Array<Record<string, unknown>>;

  const first = scenes[0];
  if (first.type !== 'title') errors.push('scenes[0]: first scene must be type "title"');

  const last = scenes[scenes.length - 1];
  if (last.type !== 'title' && last.type !== 'bullets')
    errors.push(`scenes[${scenes.length - 1}]: last scene must be type "title" or "bullets"`);

  let runStart = 0;
  for (let i = 1; i <= scenes.length; i++) {
    if (i < scenes.length && scenes[i].type === scenes[runStart].type) continue;
    const runLen = i - runStart;
    if (runLen > 2)
      errors.push(
        `scenes[${runStart}]: type "${String(scenes[runStart].type)}" appears ${runLen} times in a row (max 2)`,
      );
    runStart = i;
  }

  scenes.forEach((s, i) => {
    const stepped = Array.isArray(s.steps) && typeof s.steps[0] === 'object';
    const hasNarration = typeof s.narration === 'string' && s.narration !== '';
    const owner = `scenes[${i}]`;

    if (stepped) {
      // Step-level narration: exactly one of the two forms; 2-8 steps
      // (schema caps flow/bullets at 5), each 6-40 words.
      if (hasNarration) errors.push(`${owner}: provide either narration or steps, not both`);
      if (s.type === 'bullets' && s.items) errors.push(`${owner}: provide either items or steps, not both`);
      const steps = s.steps as Array<Record<string, unknown>>;
      steps.forEach((st, m) => {
        const n = String(st.narration ?? '');
        const wc = n.trim().split(/\s+/).filter(Boolean).length;
        if (wc < 6 || wc > 40)
          errors.push(`${owner}.steps[${m}].narration: word count ${wc} is outside 6-40`);
        errors.push(...hygieneErrors(n, `${owner}.steps[${m}]`));
      });
      return;
    }

    if (!hasNarration) {
      if (s.type === 'bullets' && s.steps)
        errors.push(`${owner}: bullets with steps must not set scene-level narration`);
      else if (s.type === 'bullets' && !s.items)
        errors.push(`${owner}: bullets scene needs items (with narration) or steps`);
      else if (s.type === 'flow')
        errors.push(`${owner}: flow needs a scene-level narration (or stepped steps)`);
      return;
    }

    const narration = String(s.narration);
    const wc = narration.trim().split(/\s+/).filter(Boolean).length;
    if (wc < 12 || wc > 60)
      errors.push(`${owner}.narration: word count ${wc} is outside 12-60`);
    errors.push(...hygieneErrors(narration, owner));
  });

  scenes.forEach((s, i) => {
    if (s.type !== 'graph') return;
    const owner = `scenes[${i}]`;
    const beforeFit = errors.length;
    if ('narration' in s)
      errors.push(`${owner}: graph scenes use steps with their own narration, not a scene narration`);
    const nodes = (s.nodes ?? []) as Array<Record<string, unknown>>;
    const edges = (s.edges ?? []) as Array<Record<string, unknown>>;
    const steps = (s.steps ?? []) as Array<Record<string, unknown>>;
    const ids = nodes.map((n) => String(n.id));
    const idSet = new Set(ids);
    const dup = ids.filter((x, k) => ids.indexOf(x) !== k);
    for (const d of [...new Set(dup)]) errors.push(`${owner}: duplicate node id "${d}"`);
    const pairs = edges.map((e) => `${String(e.from)}->${String(e.to)}`);
    edges.forEach((e, j) => {
      for (const side of ['from', 'to'] as const) {
        const ref = String(e[side] ?? '');
        if (!idSet.has(ref))
          errors.push(`${owner}.edges[${j}]: ${side} id "${ref}" does not name a node`);
      }
    });
    const uniqPairs = [...new Set(pairs)];
    if (uniqPairs.length !== pairs.length)
      errors.push(`${owner}.edges: duplicate edge pair (focus references must be unique)`);
    const focused = new Set<string>();
    steps.forEach((st, k) => {
      ((st.focus ?? []) as unknown[]).forEach((tok, m) => {
        const t = String(tok);
        focused.add(t);
        if (t.includes('->')) {
          if (!uniqPairs.includes(t))
            errors.push(`${owner}.steps[${k}].focus[${m}]: unknown edge "${t}"`);
        } else if (!idSet.has(t)) {
          errors.push(`${owner}.steps[${k}].focus[${m}]: unknown node id "${t}"`);
        }
      });
    });
    // Legibility: simulate the EXACT layout the renderer uses (shared
    // src/graph-layout.ts) and reject graphs whose fitted font would fall
    // below MIN_FONT, with remove-N / shorten-to guidance.
    if (errors.length === beforeFit) {
      const dirRaw = s.direction === 'TB' ? 'TB' : 'LR';
      const gNodes = nodes.map((n) => ({
        id: String(n.id),
        label: String(n.label),
        kind: n.kind as LayoutNode['kind'],
      }));
      const gEdges = edges.map((e) => ({
        from: String(e.from),
        to: String(e.to),
        label: e.label ? String(e.label) : undefined,
      }));
      const advice = fitAdvice(gNodes, gEdges, dirRaw, typeof s.title === 'string');
      if (advice) {
        const longest = [...gNodes]
          .sort((a, b) => b.label.length - a.label.length)
          .slice(0, 3)
          .map((n) => `"${n.label}" (${n.label.length})`)
          .join(', ');
        let msg = `${owner}: graph text would render at ${advice.fittedFont}px, below the ${MIN_FONT}px minimum - remove at least ${advice.mustRemove} node(s)`;
        msg += advice.shortestHint > 0
          ? `, or shorten every label to <= ${advice.shortestHint} characters (longest now: ${longest})`
          : ` (shortening alone cannot fix this; longest labels: ${longest})`;
        errors.push(msg);
      }
    }
    for (const id of ids) {
      const touched =
        focused.has(id) ||
        pairs.some((p) => focused.has(p) && (p === `${id}->` || p.split('->').includes(id)));
      if (!touched) errors.push(`${owner}: node "${id}" is never focused (it would never appear)`);
    }
  });

  scenes.forEach((s, i) => {
    if (s.type !== 'code') return;
    const owner = `scenes[${i}]`;
    if ('narration' in s)
      errors.push(`${owner}: code scenes use steps with their own narration, not a scene narration`);
    const lines = codeLines(s);
    checkCodeSize(s, owner, errors);
    const steps = (s.steps ?? []) as Array<Record<string, unknown>>;
    steps.forEach((st, k) => {
      ((st.lines ?? []) as unknown[]).forEach((lnRef, m) => {
        const n = Number(lnRef);
        if (!(n >= 1 && n <= lines.length))
          errors.push(`${owner}.steps[${k}].lines[${m}]: line ${String(lnRef)} does not exist (code has ${lines.length} lines)`);
      });
    });
    const covered = new Set<number>();
    steps.forEach((st) => ((st.lines ?? []) as unknown[]).forEach((ln) => covered.add(Number(ln))));
    for (let k = 1; k <= lines.length; k++) {
      if (!covered.has(k))
        errors.push(`${owner}: line ${k} is never focused (every line should be explained at least once)`);
    }
  });

  scenes.forEach((s, i) => {
    if (s.type !== 'trace') return;
    const owner = `scenes[${i}]`;
    if ('narration' in s)
      errors.push(`${owner}: trace scenes use steps with their own narration, not a scene narration`);
    checkCodeSize(s, owner, errors);
    // SAFETY: only code inside this project may ever be executed.
    const src = String(s.source ?? '');
    const abs = resolve(src);
    const rel = relative(resolve(process.cwd()), abs);
    if (src.includes('\0') || isAbsolute(rel) || rel.startsWith('..') || rel === '')
      errors.push(`${owner}.source: "${src}" is outside this project - the trace tool only runs project code`);
    else if (!abs.endsWith('.py'))
      errors.push(`${owner}.source: the trace tool runs .py files only`);
    else if (!existsSync(abs))
      errors.push(`${owner}.source: file not found: ${src}`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(s.entry ?? '')))
      errors.push(`${owner}.entry: "${String(s.entry ?? '')}" is not a valid python function name`);
    let prev = 0;
    const steps = (s.steps ?? []) as Array<Record<string, unknown>>;
    steps.forEach((st, k) => {
      const t = Number(st.toState);
      if (t <= prev)
        errors.push(`${owner}.steps[${k}].toState: ${t} does not increase (previous step ended at ${prev})`);
      prev = t;
    });
    // Post-injection checks (only once the pipeline has recorded the trace):
    if (s.trace && typeof s.trace === 'object') {
      const tr = s.trace as {states?: unknown[]; error?: string | null};
      if (typeof tr.error === 'string' && tr.error)
        errors.push(`${owner}: the recorded trace ended in an error: ${tr.error} (fix the snippet or the args)`);
      const count = Array.isArray(tr.states) ? tr.states.length : 0;
      steps.forEach((st, k) => {
        const t = Number(st.toState);
        if (t > count)
          errors.push(`${owner}.steps[${k}].toState: ${t} exceeds the ${count} states the trace recorded`);
      });
      const live = createHash('sha256')
        .update(readFileSync(abs) + String(s.entry) + String(s.args))
        .digest('hex')
        .slice(0, 16);
      if (s.traceHash !== live)
        errors.push(`${owner}: trace is STALE (code, entry or args changed) - re-run the trace step (npm run make)`);
    }
  });

  const empties: string[] = [];
  walkStrings(script, '', empties);
  errors.push(...empties);

  return errors;
}

export function validateScript(raw: string): ValidationResult {
  const parsed = parseMaybeWrapped(raw);
  if (parsed.error) return {ok: false, errors: [parsed.error]};

  const result = ScriptSchema.safeParse(parsed.value);
  if (!result.success) {
    const errors: string[] = [];
    for (const issue of result.error.issues as unknown as Issue[]) {
      errors.push(...fmtIssue(issue, parsed.value));
    }
    return {ok: false, errors: [...new Set(errors)]};
  }

  const semantic = semanticErrors(parsed.value as Record<string, unknown>);
  if (semantic.length) return {ok: false, errors: semantic};

  return {ok: true, errors: [], data: parsed.value as Record<string, unknown>};
}

// ---- CLI ----
if (process.argv[1] && process.argv[1].endsWith('validate.ts')) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: npm run validate -- projects/<id>/scenes.json');
    process.exit(2);
  }
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`[validate] cannot read ${file}: ${(e as Error).message}`);
    process.exit(2);
  }
  const {ok, errors, data} = validateScript(raw);
  if (ok) {
    const n = ((data as {scenes?: unknown[]})?.scenes ?? []).length;
    console.log(`[validate] ok, ${n} scenes: ${file}`);
    process.exit(0);
  }
  for (const line of errors) console.log(line);
  process.exit(1);
}
