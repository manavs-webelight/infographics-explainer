import {theme} from '../../theme';

export type BoxKind = 'rect' | 'pill' | 'diamond';

// Fixed-size themed node box (positioned absolutely by the parent).
// Colors come from theme only. `active` switches to the accent2 highlight.
export const Box: React.FC<{
  kind: BoxKind;
  width: number;
  height: number;
  borderColor?: string;
  active: boolean;
  label: string;
  fontSize?: number;
}> = ({kind, width, height, borderColor = theme.accent, active, label, fontSize = 28}) => {
  const fs = Math.max(28, fontSize); // hard rule: no scene text under 28px
  const border = active ? theme.accent2 : borderColor;
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: active ? theme.text : theme.muted,
    fontFamily: theme.font,
    fontSize: fs,
    fontWeight: 600,
    textAlign: 'center',
    padding: kind === 'diamond' ? '0 20%' : 10,
  };
  if (kind === 'diamond') {
    return (
      <div style={{position: 'absolute', width, height}}>
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
          <polygon
            points={`${width / 2},2 ${width - 2},${height / 2} ${width / 2},${height - 2} 2,${height / 2}`}
            fill={theme.card}
            stroke={border}
            strokeWidth={active ? 4 : 3}
          />
        </svg>
        <div style={labelStyle}>{label}</div>
      </div>
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        width,
        height,
        background: theme.card,
        border: `${active ? 4 : 3}px solid ${border}`,
        borderRadius: kind === 'pill' ? height / 2 : 18,
        boxShadow: active ? `0 0 44px ${theme.accent2}44` : 'none',
      }}
    >
      <div style={labelStyle}>{label}</div>
    </div>
  );
};
