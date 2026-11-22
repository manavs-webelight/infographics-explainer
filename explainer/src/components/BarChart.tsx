import {Layout} from './Layout';
import {theme} from '../theme';
import {useIn} from '../anim';
const Bar: React.FC<{label: string; value: number; max: number; i: number}> = ({label, value, max, i}) => {
  const a = useIn(10 + i * 10);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', flex: 1}}>
      <div style={{fontSize: 44, fontWeight: 700, marginBottom: 14, opacity: a}}>{value}</div>
      <div style={{width: '70%', height: (value / max) * 520 * a, background: theme.accent, borderRadius: '12px 12px 0 0'}} />
      <div style={{fontSize: 36, color: theme.muted, marginTop: 20}}>{label}</div>
    </div>
  );
};
export const BarChart: React.FC<{title: string; data: {label: string; value: number}[]}> = ({title, data}) => {
  const t = useIn(0);
  const max = Math.max(...data.map((d) => d.value));
  return (
    <Layout>
      <div style={{fontSize: 64, fontWeight: 700, marginBottom: 50, opacity: t}}>{title}</div>
      <div style={{display: 'flex', alignItems: 'flex-end', height: 640, borderBottom: `3px solid ${theme.line}`}}>
        {data.map((d, i) => <Bar key={i} {...d} max={max} i={i} />)}
      </div>
    </Layout>
  );
};
