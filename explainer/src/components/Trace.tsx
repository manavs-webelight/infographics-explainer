import {Layout} from './Layout';
import {useIn, useStep} from '../anim';
import {theme} from '../theme';
import {TRACE_FONT, TRACE_HEAD_FONT, TRACE_ROW_H, traceLayout} from '../graph-layout';

// Replays REAL recorded execution states (pipeline/trace.ts -> sys.settrace).
// States are pipeline-injected; this component only reads them. All text is
// >= 28px (traceLayout: code/gutter/vars 28, state header 30, heading 64).
type State = {
  n: number;
  event: 'line' | 'return';
  func: string;
  line: number;
  vars: Record<string, string>;
  returns?: string;
};
type TraceStep = {
  narration?: string;
  toState: number;
  startFrame?: number;
  frames?: number;
};
type Run = [string, string | null];

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// Which recorded state is on screen: within a step, new states (prev+1..to)
// reveal one by one as the step's audio progresses.
export const stateAt = (
  steps: TraceStep[],
  index: number,
  progress: number,
): number => {
  if (index < 0) return 0;
  const to = steps[index].toState;
  const prev = index > 0 ? steps[index - 1].toState : 0;
  // ceil: every state in the step's range is on screen for a slice of the
  // step INCLUDING the last one (floor would show it only at the very end).
  const idx = prev + Math.ceil(progress * (to - prev));
  return Math.min(Math.max(idx, prev + 1), to);
};

export const Trace: React.FC<any> = (props) => {
  const heading = useIn(0);
  const steps = (props.steps ?? []) as TraceStep[];
  const {index, progress} = useStep(steps);
  const title = props.title as string | undefined;
  const code = String(props.code ?? '').replace(/\s+$/, '');
  const lines = code.split('\n');
  const tokens = props.tokens as Run[][] | undefined;
  const trace = props.trace as {states?: State[]; result?: string | null} | undefined;
  const states = (trace?.states ?? []) as State[];
  const layout = traceLayout(lines.length, !!title);

  const shown = stateAt(steps, index, progress);
  const cur = shown > 0 ? states[shown - 1] : undefined;
  const prev = shown > 1 ? states[shown - 2] : undefined;

  return (
    <Layout>
      {title && (
        <div style={{position: 'absolute', top: 64, left: 96, width: 1720, opacity: heading}}>
          <div style={{width: 72, height: 8, background: theme.accent, borderRadius: 4, marginBottom: 18}} />
          <div style={{fontSize: 64, fontWeight: 700, color: theme.text}}>{title}</div>
        </div>
      )}
      {/* left: the code, with the CURRENT traced line highlighted */}
      <div style={{position: 'absolute', top: layout.top, left: layout.codeLeft - 66, width: 1080, opacity: cur ? 1 : 0.45}}>
        {lines.map((text, i) => {
          const n = i + 1;
          const on = cur !== undefined && n === cur.line;
          const rowTokens = tokens?.[i] as Run[] | undefined;
          return (
            <div
              key={n}
              style={{
                position: 'relative',
                height: layout.rowH,
                display: 'flex',
                alignItems: 'center',
                background: on ? theme.soft : 'transparent',
                borderRadius: 8,
              }}
            >
              {on && (
                <div style={{position: 'absolute', left: 52, top: 5, bottom: 5, width: 7, borderRadius: 4, background: theme.accent2}} />
              )}
              <div style={{width: 58, paddingRight: 14, textAlign: 'right', fontSize: TRACE_FONT, fontFamily: MONO, color: on ? theme.accent2 : theme.muted}}>
                {n}
              </div>
              <pre style={{margin: 0, fontSize: TRACE_FONT, lineHeight: `${layout.rowH}px`, fontFamily: MONO, color: theme.text, whiteSpace: 'pre'}}>
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
      {/* right: the live state box */}
      {cur && (
        <div
          style={{
            position: 'absolute',
            top: layout.top,
            left: layout.panelX,
            width: layout.panelW,
            background: theme.card,
            border: `2px solid ${theme.line}`,
            boxShadow: theme.shadow,
            borderRadius: 20,
            padding: '26px 34px',
          }}
        >
          <div style={{fontSize: TRACE_HEAD_FONT, fontWeight: 700, color: theme.accent2, marginBottom: 18, fontFamily: MONO}}>
            STATE {cur.n} · LINE {cur.line} · {cur.event.toUpperCase()}
          </div>
          {Object.entries(cur.vars).map(([k, v]) => {
            const changed = prev === undefined || prev.vars[k] !== v;
            return (
              <div key={k} style={{fontFamily: MONO, fontSize: TRACE_FONT, lineHeight: '46px'}}>
                <span style={{color: theme.accent, fontWeight: 600}}>{k}</span>
                <span style={{color: theme.muted}}> = </span>
                <span style={{color: changed ? theme.accent2 : theme.text, fontWeight: changed ? 700 : 400}}>{v}</span>
              </div>
            );
          })}
          {cur.returns && (
            <div style={{fontFamily: MONO, fontSize: TRACE_FONT, lineHeight: '46px', color: theme.accent2, fontWeight: 700}}>
              returns {cur.returns}
            </div>
          )}
          {shown === steps[steps.length - 1]?.toState && trace?.result !== undefined && trace?.result !== null && (
            <div style={{fontFamily: MONO, fontSize: TRACE_FONT, lineHeight: '46px', color: theme.accent2, fontWeight: 700}}>
              result {trace.result}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
};
