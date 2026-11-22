import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Layout} from './Layout';
import {useIn, useStep} from '../anim';
import {theme} from '../theme';

// Timeline: events along a horizontal axis, alternating above and below.
// Each step IS one event {when, label, detail?}: it appears when its narration
// starts, and the accent fill of the axis grows up to it. Past events stay
// visible but quiet; the current one has the accent border.
type TStep = {when: string; label: string; detail?: string; startFrame?: number; frames?: number};

const CARD_W = 440; // 6 events: same-side neighbours are 560px apart and the end cards are clamped inward, so <= 450 never overlaps
const X0 = 120;
const X1 = 1800;

export const Timeline: React.FC<any> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const heading = useIn(0);
  const steps = (props.steps ?? []) as TStep[];
  const {index} = useStep(steps);
  const title = props.title as string | undefined;
  const n = steps.length;

  const availTop = title ? 230 : 100;
  const axisY = availTop + (1080 - 100 - availTop) / 2;
  const spacing = (X1 - X0) / n;
  const xs = steps.map((_, i) => X0 + (i + 0.5) * spacing);

  // Accent fill: from the left end to the current event, easing over 16 frames.
  let fillX = X0;
  if (index >= 0) {
    const from = index === 0 ? X0 : xs[index - 1];
    const p = interpolate(frame - Number(steps[index].startFrame ?? 0), [0, 16], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    fillX = from + (xs[index] - from) * p;
  }

  return (
    <Layout>
      {title && (
        <div style={{position: 'absolute', top: 64, left: 120, width: 1680, opacity: heading}}>
          <div style={{width: 72, height: 8, background: theme.accent, borderRadius: 4, marginBottom: 18}} />
          <div style={{fontSize: 64, fontWeight: 700, color: theme.text}}>{title}</div>
        </div>
      )}
      <div style={{position: 'absolute', left: X0, top: axisY - 2, width: (X1 - X0) * heading, height: 4, borderRadius: 2, background: theme.line}} />
      <div style={{position: 'absolute', left: X0, top: axisY - 2, width: fillX - X0, height: 4, borderRadius: 2, background: theme.accent}} />
      {steps.map((st, i) => {
        const start = Number(st.startFrame ?? 0);
        if (frame < start) return null;
        const a = spring({frame: frame - start, fps, config: {damping: 200}});
        const on = i === index;
        const above = i % 2 === 0;
        const left = Math.min(Math.max(xs[i] - CARD_W / 2, X0), X1 - CARD_W);
        const slide = (1 - a) * 36 * (above ? 1 : -1);
        return (
          <div key={i}>
            <div
              style={{
                position: 'absolute',
                left: xs[i] - 14,
                top: axisY - 14,
                width: 28,
                height: 28,
                boxSizing: 'border-box',
                borderRadius: 14,
                background: on ? theme.accent : theme.card,
                border: `4px solid ${on ? theme.accent : theme.line}`,
                transform: `scale(${a})`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: xs[i] - 1.5,
                width: 3,
                height: 30,
                top: above ? axisY - 14 - 30 : axisY + 14,
                background: on ? theme.accent : theme.line,
                opacity: a,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left,
                width: CARD_W,
                boxSizing: 'border-box',
                padding: '18px 24px 20px',
                background: theme.card,
                border: `2px solid ${on ? theme.accent : theme.line}`,
                borderRadius: 22,
                boxShadow: theme.shadow,
                opacity: on ? a : 0.72 * a,
                transform: `translateY(${slide}px)`,
                ...(above ? {bottom: 1080 - (axisY - 14 - 30)} : {top: axisY + 14 + 30}),
              }}
            >
              <div style={{fontSize: 28, fontWeight: 700, color: theme.accent2, lineHeight: 1.2}}>{st.when}</div>
              <div style={{fontSize: 32, fontWeight: 700, color: theme.text, lineHeight: 1.25, marginTop: 6}}>{st.label}</div>
              {st.detail && (
                <div style={{fontSize: 28, fontWeight: 500, color: theme.muted, lineHeight: 1.25, marginTop: 8}}>{st.detail}</div>
              )}
            </div>
          </div>
        );
      })}
    </Layout>
  );
};
