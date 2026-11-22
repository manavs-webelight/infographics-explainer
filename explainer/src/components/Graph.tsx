import {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Layout} from './Layout';
import {useIn, useStep} from '../anim';
import {theme} from '../theme';
import {Arrow, Box, FocusDim, type Point} from './primitives';
import {graphFit, MIN_FONT} from '../graph-layout';

type GNode = {id: string; label: string; kind: 'start' | 'process' | 'decision' | 'end'};
type GEdge = {from: string; to: string; label?: string};
type GStep = {narration?: string; focus: string[]; startFrame?: number; frames?: number};

// Reveal rule (documented in the catalog):
// - focusing a node reveals the node;
// - focusing an edge reveals the edge and both endpoints;
// - once a node is revealed, its incoming edges (from already-revealed
//   sources) reveal together with it in the same step.
const computeReveal = (
  steps: GStep[],
  edges: GEdge[],
): {nodeAt: Map<string, number>; edgeAt: Map<string, number>} => {
  const nodeAt = new Map<string, number>();
  const edgeAt = new Map<string, number>();
  const put = (m: Map<string, number>, k: string, f: number) => {
    if (!m.has(k)) m.set(k, f);
  };
  for (const st of steps) {
    const f = st.startFrame ?? 0;
    for (const raw of st.focus ?? []) {
      const tok = String(raw);
      if (tok.includes('->')) {
        const [a, b] = tok.split('->');
        put(edgeAt, tok, f);
        put(nodeAt, a, f);
        put(nodeAt, b, f);
      } else {
        put(nodeAt, tok, f);
      }
    }
  }
  for (const st of steps) {
    const f = st.startFrame ?? 0;
    for (const raw of st.focus ?? []) {
      const tok = String(raw);
      if (tok.includes('->')) continue;
      for (const e of edges) {
        if (e.to !== tok) continue;
        const key = `${e.from}->${e.to}`;
        if (edgeAt.has(key)) continue;
        const src = nodeAt.get(e.from);
        if (src !== undefined && src <= f) put(edgeAt, key, f);
      }
    }
  }
  return {nodeAt, edgeAt};
};

export const Graph: React.FC<any> = (props) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const heading = useIn(0);
  const steps = (props.steps ?? []) as GStep[];
  const {index} = useStep(steps);
  const nodes = (props.nodes ?? []) as GNode[];
  const edges = (props.edges ?? []) as GEdge[];
  const direction = (props.direction ?? 'LR') as 'LR' | 'TB';
  const title = props.title as string | undefined;

  // ONE source of truth with the validator: src/graph-layout.ts.
  const fit = useMemo(
    () => graphFit(nodes, edges, direction, !!title),
    [nodes, edges, direction, title],
  );
  const laid = fit.g;

  // Fitted scale/offsets from the shared module (validator guarantees s >= 1,
  // so the font floor below is a last-resort guard, never the working path).
  const {s, ox, oy} = fit;
  const graphFont = Math.max(MIN_FONT, Math.round(MIN_FONT * s));
  const tx = (p: Point): Point => ({x: p.x * s + ox, y: p.y * s + oy});

  const {nodeAt, edgeAt} = useMemo(() => computeReveal(steps, edges), [steps, edges]);
  const active = new Set<string>((steps[index]?.focus ?? []).map(String));

  const revealFade = (from: number) =>
    interpolate(frame - from, [0, 12], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  return (
    <Layout>
      {title && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: 120,
            width: width - 240,
            opacity: heading,
            transform: `translateY(${(1 - heading) * -24}px)`,
          }}
        >
          <div style={{width: 72, height: 8, background: theme.accent, borderRadius: 4, marginBottom: 18}} />
          <div style={{fontSize: 64, fontWeight: 700, color: theme.text}}>{title}</div>
        </div>
      )}
      <AbsoluteFill>
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
          {edges.map((e) => {
            const key = `${e.from}->${e.to}`;
            const from = edgeAt.get(key);
            if (from === undefined) return null;
            const ep = laid.edge({v: e.from, w: e.to}) as
              | {points?: Point[]}
              | undefined;
            if (!ep?.points || ep.points.length < 2) return null;
            const pts = ep.points.map(tx);
            const progress = interpolate(frame - from, [0, 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const on = active.has(key);
            const color = on ? theme.accent : theme.line;
            const mid = pts[Math.floor((pts.length - 1) / 2)];
            return (
              <g key={key} opacity={revealFade(from) * (on ? 1 : 0.55)}>
                <Arrow points={pts} progress={progress} color={color} />
                {e.label && progress > 0.5 && (
                  <text
                    x={mid.x}
                    y={mid.y - 12}
                    textAnchor="middle"
                    fontSize={graphFont}
                    fontWeight={600}
                    fill={on ? theme.accent2 : theme.muted}
                    stroke={theme.bg}
                    strokeWidth={6}
                    paintOrder="stroke"
                    fontFamily={theme.font}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => {
          const from = nodeAt.get(n.id);
          if (from === undefined) return null;
          const appear = spring({frame: frame - from, fps, config: {damping: 200}});
          const nd = laid.node(n.id) as {x: number; y: number; width: number; height: number};
          const c = tx({x: nd.x, y: nd.y});
          const w = nd.width * s;
          const h = nd.height * s;
          const on = active.has(n.id);
          return (
            <div
              key={n.id}
              style={{
                position: 'absolute',
                left: c.x - w / 2,
                top: c.y - h / 2,
                width: w,
                height: h,
                opacity: appear,
                transform: `scale(${0.85 + appear * 0.15})`,
              }}
            >
              <FocusDim active={on}>
                <Box
                  kind={n.kind === 'decision' ? 'diamond' : n.kind === 'process' ? 'rect' : 'pill'}
                  width={w}
                  height={h}
                  active={on}
                  label={n.label}
                  fontSize={graphFont}
                />
              </FocusDim>
            </div>
          );
        })}
      </AbsoluteFill>
    </Layout>
  );
};
