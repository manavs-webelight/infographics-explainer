import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Layout} from './Layout';
import {useIn, useStep} from '../anim';
import {theme} from '../theme';
import {CODE_FONT, CODE_ROW_H} from '../graph-layout';

// Syntax colors come from the shiki theme (github-dark), pre-tokenized by the
// pipeline. Structural colors (title, gutter, focus bar, dim) are theme-only.
type CodeStep = {
  narration?: string;
  lines: number[];
  startFrame?: number;
  frames?: number;
};
type Run = [string, string | null];

// Geometry shared with the validator's fit rule: rows start under the heading
// and are centered in the remaining safe area.
export const codeLayout = (lineCount: number, hasTitle: boolean) => {
  const topPad = 120 + (hasTitle ? 130 : 0);
  const availH = 1080 - topPad - 120;
  const top = topPad + (availH - lineCount * CODE_ROW_H) / 2;
  return {top, rowH: CODE_ROW_H, left: 160, right: 1760};
};

export const Code: React.FC<any> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const heading = useIn(0);
  const steps = (props.steps ?? []) as CodeStep[];
  const {index} = useStep(steps);
  const title = props.title as string | undefined;
  const code = String(props.code ?? '').replace(/\s+$/, '');
  const lines = code.split('\n');
  const tokens = props.tokens as Run[][] | undefined;
  const layout = codeLayout(lines.length, !!title);

  const active = new Set<number>((steps[index]?.lines ?? []).map(Number));

  // Per-line opacity: active lines fade/scale up, the rest stay visible but
  // dimmed. lastFlip is the startFrame of the step that changed this line's
  // state, so the transition is frame-deterministic.
  const lineState = (n: number) => {
    const isOn = active.has(n);
    // Only PAST transitions animate: scan steps up to the current one, so a
    // future un-highlight never steals the spring's start frame.
    // Lines never turned on yet: animate from scene start (spring cannot
    // handle an effectively-infinite negative offset).
    let lastFlip = 0;
    let wasOn = false;
    for (let k = 0; k <= index; k++) {
      const nowOn = (steps[k].lines ?? []).map(Number).includes(n);
      if (nowOn !== wasOn) {
        lastFlip = steps[k].startFrame ?? 0;
        wasOn = nowOn;
      }
    }
    const grow = spring({frame: frame - lastFlip, fps, config: {damping: 200}});
    // active fades 0.5 -> 1; de-activated fades back 1 -> 0.5
    return {isOn, opacity: isOn ? 0.5 + 0.5 * grow : 1 - 0.5 * grow, grow};
  };

  return (
    <Layout>
      {title && (
        <div style={{position: 'absolute', top: 64, left: 120, width: 1680, opacity: heading}}>
          <div style={{width: 72, height: 8, background: theme.accent2, borderRadius: 4, marginBottom: 18}} />
          <div style={{fontSize: 64, fontWeight: 800, color: theme.text}}>{title}</div>
        </div>
      )}
      <div style={{position: 'absolute', top: layout.top, left: layout.left, width: layout.right - layout.left}}>
        {lines.map((text, i) => {
          const n = i + 1;
          const {isOn, opacity, grow} = lineState(n);
          const rowTokens = tokens?.[i] as Run[] | undefined;
          return (
            <div
              key={n}
              style={{
                position: 'relative',
                height: layout.rowH,
                display: 'flex',
                alignItems: 'center',
                opacity,
                background: isOn ? theme.card : 'transparent',
                borderRadius: 10,
                transform: `translateX(${(1 - grow) * -14}px)`,
              }}
            >
              {isOn && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 6,
                    bottom: 6,
                    width: 8,
                    borderRadius: 4,
                    background: theme.accent2,
                  }}
                />
              )}
              <div
                style={{
                  width: 78,
                  textAlign: 'right',
                  paddingRight: 22,
                  fontSize: 28,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  color: isOn ? theme.accent2 : theme.muted,
                }}
              >
                {n}
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: CODE_FONT,
                  lineHeight: `${layout.rowH}px`,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  color: theme.text,
                  whiteSpace: 'pre',
                }}
              >
                {rowTokens
                  ? rowTokens.map((tok, k) => (
                      <span key={k} style={{color: tok[1] ?? theme.text}}>
                        {tok[0]}
                      </span>
                    ))
                  : text}
              </pre>
            </div>
          );
        })}
      </div>
    </Layout>
  );
};
