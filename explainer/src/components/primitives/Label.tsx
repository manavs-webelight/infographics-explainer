import {theme} from '../../theme';

// Absolutely positioned centered text label (HTML overlay).
export const Label: React.FC<{
  x: number;
  y: number;
  text: string;
  color?: string;
  size?: number;
}> = ({x, y, text, color = theme.muted, size = 28}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: 'translate(-50%, -50%)',
      color,
      fontFamily: theme.font,
      fontSize: Math.max(28, size),
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </div>
);
