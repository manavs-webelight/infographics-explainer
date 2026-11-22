import {Layout} from './Layout';
import {theme} from '../theme';
import {useIn, useStep} from '../anim';
import {CheckCircle2} from 'lucide-react';

type BulletStep = {
  item: string;
  narration?: string;
  startFrame?: number;
  frames?: number;
};

const Item: React.FC<{text: string; delay: number; stagger: number; active?: boolean}> = ({
  text,
  delay,
  stagger,
  active,
}) => {
  const a = useIn(delay + stagger);
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 28, fontSize: 56, marginBottom: 40, opacity: a, transform: `translateX(${(1 - a) * 60}px)`}}>
      <CheckCircle2 size={64} color={active ? theme.accent2 : theme.accent} />
      <span style={{color: active ? theme.accent2 : theme.text}}>{text}</span>
    </div>
  );
};

export const BulletList: React.FC<{
  title: string;
  items?: string[];
  steps?: BulletStep[];
}> = ({title, items, steps}) => {
  const t = useIn(0);
  const stepped = !!steps && steps.length > 0;
  const {index} = useStep(stepped ? steps! : []);
  const heading = <div style={{fontSize: 72, fontWeight: 700, marginBottom: 70, opacity: t}}>{title}</div>;

  if (stepped) {
    return (
      <Layout>
        {heading}
        {steps!.map((s, i) => (
          <Item key={i} text={s.item} delay={s.startFrame ?? 0} stagger={0} active={index === i} />
        ))}
      </Layout>
    );
  }

  return (
    <Layout>
      {heading}
      {(items ?? []).map((it, i) => (
        <Item key={i} text={it} delay={14} stagger={i * 16} />
      ))}
    </Layout>
  );
};
