import {graphlib, layout as dagreLayout} from '@dagrejs/dagre';

// Shared graph layout math - imported by BOTH the React component (src/components/
// Graph.tsx) and the pipeline validator. One source of truth: what the
// validator promises (fits, font >= MIN_FONT) is exactly what renders.
//
// RULE (user): no scene text may render below 28 px at 1920x1080.
// Graph node/edge label font size = MIN_FONT * s, with a hard floor of
// MIN_FONT. The validator requires s >= 1.0, i.e. fitted font >= 28 px.

export type LayoutNode = {
  id: string;
  label: string;
  kind: 'start' | 'process' | 'decision' | 'end';
};
export type LayoutEdge = {from: string; to: string; label?: string};

export const MIN_FONT = 28;
export const NODE_SEP = 40;
export const RANK_SEP = 60;
export const MAX_SCALE = 1.15;

export const nodeSize = (n: LayoutNode): {width: number; height: number} => {
  const est = n.label.length * 17 + 56;
  if (n.kind === 'decision')
    return {width: Math.min(Math.max(est + 60, 200), 340), height: 130};
  if (n.kind === 'start' || n.kind === 'end')
    return {width: Math.min(Math.max(est, 150), 260), height: 66};
  return {width: Math.min(Math.max(est, 170), 320), height: 76};
};

export type GraphFit = {
  g: any; // laid-out graphlib graph (component renders this)
  meta: {width: number; height: number};
  s: number;
  ox: number;
  oy: number;
  fittedFont: number; // px the labels actually render at
};

export const graphFit = (
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: 'LR' | 'TB',
  hasTitle: boolean,
  width = 1920,
  height = 1080,
): GraphFit => {
  const g = new graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    marginx: 24,
    marginy: 24,
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, nodeSize(n));
  for (const e of edges) g.setEdge({v: e.from, w: e.to}, {label: e.label ?? ''});
  dagreLayout(g);
  const meta = g.graph() as {width: number; height: number};
  const topPad = 120 + (hasTitle ? 130 : 0);
  const availW = width - 240;
  const availH = height - topPad - 120;
  const s = Math.min(availW / meta.width, availH / meta.height, MAX_SCALE);
  const ox = (width - meta.width * s) / 2;
  const oy = topPad + (availH - meta.height * s) / 2;
  return {g, meta, s, ox, oy, fittedFont: Math.round(MIN_FONT * s)};
};

// How many nodes (and which labels) would make this graph fit at MIN_FONT?
// Returns null when it already fits.
export const fitAdvice = (
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: 'LR' | 'TB',
  hasTitle: boolean,
): {mustRemove: number; shortestHint: number; fittedFont: number} | null => {
  const first = graphFit(nodes, edges, direction, hasTitle);
  if (first.s >= 0.999999) return null;
  let curNodes = [...nodes];
  const curEdges = [...edges];
  let mustRemove = 0;
  while (curNodes.length > 2) {
    const alive = new Set(curNodes.map((n) => n.id));
    const live = curEdges.filter((e) => alive.has(e.from) && alive.has(e.to));
    const f = graphFit(curNodes, live, direction, hasTitle);
    if (f.s >= 0.999999) break;
    // drop the most-connected node (ties: the longest label)
    const deg = new Map<string, number>();
    for (const e of live) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    curNodes.sort(
      (a, b) =>
        (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) ||
        b.label.length - a.label.length,
    );
    curNodes = curNodes.slice(1);
    mustRemove += 1;
  }
  const longest = [...nodes]
    .sort((a, b) => b.label.length - a.label.length)
    .slice(0, 3);
  let shortestHint = 0;
  for (let L = 24; L >= 4; L--) {
    const shrunk = nodes.map((n) => ({
      ...n,
      label: n.label.length > L ? 'x'.repeat(L) : n.label,
    }));
    const f = graphFit(shrunk, edges, direction, hasTitle);
    if (f.s >= 0.999999) {
      shortestHint = L;
      break;
    }
  }
  return {mustRemove, shortestHint, fittedFont: first.fittedFont};
};

// ---- M7 code-walkthrough layout (shared: component + validator) ----
export const CODE_FONT = 34; // >= 32px mono requirement, and >= MIN_FONT
export const CODE_ROW_H = 48;
export const CODE_MAX_LINES = 12; // 12 * 48 = 576px, fits below the heading
export const CODE_LINE_CHARS = 60;

// Does a code scene fit the 28px floor and the safe area? Returns null when OK.
export const codeFitAdvice = (
  lines: number,
  longestLine: number,
): {lines: number; longest: number} | null => {
  if (lines <= CODE_MAX_LINES && longestLine <= CODE_LINE_CHARS) return null;
  return {lines, longest: longestLine};
};

// ---- M8 trace-scene layout (shared: component + pixel checks) ----
export const TRACE_FONT = 28; // 28px floor: code, gutter, state rows
export const TRACE_ROW_H = 38;
export const TRACE_HEAD_FONT = 30;
export const TRACE_CODE_LEFT = 96; // code text starts here (gutter left of it)
export const TRACE_PANEL_X = 1220;
export const TRACE_PANEL_W = 580;

export const traceLayout = (lineCount: number, hasTitle: boolean) => {
  const topPad = 120 + (hasTitle ? 130 : 0);
  const availH = 1080 - topPad - 120;
  const top = topPad + (availH - lineCount * TRACE_ROW_H) / 2;
  return {top, rowH: TRACE_ROW_H, codeLeft: TRACE_CODE_LEFT, panelX: TRACE_PANEL_X, panelW: TRACE_PANEL_W};
};
