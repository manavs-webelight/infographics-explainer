import {interpolate, useCurrentFrame} from 'remotion';
import {Layout} from './Layout';
import {theme} from '../theme';
import {useIn} from '../anim';
export const StatCard: React.FC<{value: number; suffix?: string; label: string}> = ({value, suffix = '', label}) => {
  const frame = useCurrentFrame();
  const a = useIn(0), b = useIn(25);
  const n = Math.round(interpolate(frame, [0, 45], [0, value], {extrapolateRight: 'clamp'}));
  return (
    <Layout>
      <div style={{textAlign: 'center'}}>
        <div style={{fontSize: 280, fontWeight: 700, letterSpacing: '-0.03em', color: theme.accent, opacity: a, transform: `scale(${0.85 + 0.15 * a})`}}>{n}{suffix}</div>
        <div style={{fontSize: 64, color: theme.muted, opacity: b}}>{label}</div>
      </div>
    </Layout>
  );
};
