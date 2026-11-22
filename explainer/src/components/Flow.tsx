import {Layout} from './Layout';
import {theme} from '../theme';
import {useIn, useStep} from '../anim';
import {ArrowRight} from 'lucide-react';

type FlowStep = {
  item: string;
  narration?: string;
  startFrame?: number;
  frames?: number;
};

// Step card. Classic scenes reveal by stagger; stepped scenes reveal at the
// step's startFrame and the active step gets the highlight border.
const Card: React.FC<{
  label: string;
  delay: number;
  n: number;
  i: number;
  active?: boolean;
}> = ({label, delay, n, i, active}) => {
  const a = useIn(delay);
  const arrow = useIn(delay + 8);
  const border = active ? theme.accent : theme.line;
  return (
    <>
      <div style={{background: theme.card, border: `2px solid ${border}`, boxShadow: theme.shadow, borderRadius: 28, padding: '50px 40px', fontSize: 46, fontWeight: 700, textAlign: 'center', minWidth: 300, opacity: a, transform: `scale(${0.8 + 0.2 * a})`}}>
        <div style={{color: theme.accent2, fontSize: 30, marginBottom: 12}}>STEP {i + 1}</div>
        {label}
      </div>
      {i < n - 1 && <ArrowRight size={72} color={theme.line} style={{opacity: arrow, transform: `translateX(${(1 - arrow) * -20}px)`}} />}
    </>
  );
};

export const Flow: React.FC<{title?: string; steps: Array<string | FlowStep>}> = ({title, steps}) => {
  const t = useIn(0);
  const stepped = typeof steps[0] === 'object';
  // hooks unconditional: empty array keeps index at -1 for classic scenes
  const {index} = useStep(stepped ? (steps as FlowStep[]) : []);
  const heading = title ? <div style={{fontSize: 64, fontWeight: 700, marginBottom: 80, opacity: t}}>{title}</div> : null;

  if (stepped) {
    const st = steps as FlowStep[];
    return (
      <Layout>
        {heading}
        <div style={{display: 'flex', alignItems: 'center', gap: 30, justifyContent: 'center'}}>
          {st.map((s, i) => (
            <Card key={i} label={s.item} delay={s.startFrame ?? 0} n={st.length} i={i} active={index === i} />
          ))}
        </div>
      </Layout>
    );
  }

  const labels = steps as string[];
  return (
    <Layout>
      {heading}
      <div style={{display: 'flex', alignItems: 'center', gap: 30, justifyContent: 'center'}}>
        {labels.map((s, i) => <Card key={i} label={s} delay={10 + i * 14} n={labels.length} i={i} />)}
      </div>
    </Layout>
  );
};
