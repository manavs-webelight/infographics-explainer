import {Layout} from './Layout';
import {theme} from '../theme';
import {useIn} from '../anim';
export const TitleCard: React.FC<{text: string; subtitle?: string}> = ({text, subtitle}) => {
  const a = useIn(0), b = useIn(12);
  return (
    <Layout>
      <div style={{width: 120 * a, height: 10, background: theme.accent, borderRadius: 5, marginBottom: 40}} />
      <div style={{fontSize: 110, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, opacity: a, transform: `translateY(${(1 - a) * 40}px)`}}>{text}</div>
      {subtitle && <div style={{fontSize: 44, color: theme.muted, marginTop: 30, opacity: b, transform: `translateY(${(1 - b) * 30}px)`}}>{subtitle}</div>}
    </Layout>
  );
};
