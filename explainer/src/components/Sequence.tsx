import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Layout} from './Layout';
import {useIn, useStep} from '../anim';
import {theme} from '../theme';
import {Arrow} from './primitives';
import {ACTOR_FONT, BOX_H, BOX_W, REVEAL_GAP, SEQ_FONT, actorXs, seqLayout} from '../sequence-layout';

// Sequence diagram: actors across the top with dashed lifelines, messages drawn
// top to bottom in time order. Step k reveals every message up to `toMessage`
// (1-based, strictly increasing; the validator requires the last step to reach
// the final message). Messages added by the current step are highlighted, older
// ones stay visible but quiet.
type Actor = {id: string; label: string};
type Msg = {from: string; to: string; label: string};
type SStep = {toMessage?: number; startFrame?: number; frames?: number};

export const Sequence: React.FC<any> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const heading = useIn(0);
  const steps = (props.steps ?? []) as SStep[];
  const {index} = useStep(steps);
  const title = props.title as string | undefined;
  const actors = (props.actors ?? []) as Actor[];
  const messages = (props.messages ?? []) as Msg[];

  const xs = actorXs(actors.length);
  const xOf = (id: string) => xs[actors.findIndex((a) => a.id === id)];
  const L = seqLayout(messages.length, !!title);

  // Which step reveals each message, and when (frame within the scene).
  const info = messages.map((_, k) => {
    const n = k + 1;
    let s = steps.findIndex((st) => Number(st.toMessage) >= n);
    if (s < 0) s = steps.length - 1;
    const prevTo = s > 0 ? Number(steps[s - 1].toMessage ?? 0) : 0;
    const reveal = Number(steps[s]?.startFrame ?? 0) + (n - prevTo - 1) * REVEAL_GAP;
    return {reveal, step: s};
  });

  const activeActors = new Set<string>();
  messages.forEach((m, k) => {
    if (info[k].step === index && frame >= info[k].reveal) {
      activeActors.add(m.from);
      activeActors.add(m.to);
    }
  });

  return (
    <Layout>
      {title && (
        <div style={{position: 'absolute', top: 64, left: 120, width: 1680, opacity: heading}}>
          <div style={{width: 72, height: 8, background: theme.accent, borderRadius: 4, marginBottom: 18}} />
          <div style={{fontSize: 64, fontWeight: 700, color: theme.text}}>{title}</div>
        </div>
      )}
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {xs.map((x, i) => (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={L.boxY + BOX_H}
            y2={L.lifelineEnd}
            stroke={theme.line}
            strokeWidth={2}
            strokeDasharray="6 10"
            opacity={heading}
          />
        ))}
        {messages.map((m, k) => {
          const {reveal, step} = info[k];
          if (frame < reveal) return null;
          const y = L.slotTop + k * L.rowH + L.rowH - 14;
          const x1 = xOf(m.from);
          const x2 = xOf(m.to);
          const progress = interpolate(frame - reveal, [0, 16], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const on = step === index;
          return (
            <Arrow
              key={k}
              points={[
                {x: x1, y},
                {x: x2, y},
              ]}
              progress={progress}
              color={on ? theme.accent : theme.line}
              width={on ? 5 : 4}
            />
          );
        })}
      </svg>
      {actors.map((a, i) => {
        const on = activeActors.has(a.id);
        const a0 = spring({frame: frame - (4 + i * 4), fps, config: {damping: 200}});
        return (
          <div
            key={a.id}
            style={{
              position: 'absolute',
              left: xs[i] - BOX_W / 2,
              top: L.boxY,
              width: BOX_W,
              height: BOX_H,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: theme.card,
              border: `2px solid ${on ? theme.accent : theme.line}`,
              borderRadius: 20,
              boxShadow: theme.shadow,
              fontSize: ACTOR_FONT,
              fontWeight: 700,
              color: theme.text,
              opacity: a0,
              transform: `translateY(${(1 - a0) * -16}px)`,
            }}
          >
            {a.label}
          </div>
        );
      })}
      {messages.map((m, k) => {
        const {reveal, step} = info[k];
        if (frame < reveal) return null;
        const on = step === index;
        const op = interpolate(frame - reveal, [4, 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const cx = (xOf(m.from) + xOf(m.to)) / 2;
        const bottom = L.slotTop + k * L.rowH + L.rowH - 22;
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              left: cx,
              top: bottom,
              transform: 'translate(-50%, -100%)',
              fontSize: SEQ_FONT,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: on ? theme.text : theme.muted,
              background: theme.bg, // masks lifelines that pass behind the text
              padding: '0 10px',
              opacity: op,
            }}
          >
            {m.label}
          </div>
        );
      })}
    </Layout>
  );
};
