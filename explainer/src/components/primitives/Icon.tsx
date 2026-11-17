import {theme} from '../../theme';

// lucide-react icon wrapper: fixed size + theme color only.
// Pass the icon component itself, e.g. <Icon icon={CheckCircle2} />.
export const Icon: React.FC<{
  icon: React.ComponentType<{size?: number; color?: string; style?: object}>;
  size?: number;
  color?: string;
  style?: object;
}> = ({icon: Cmp, size = 28, color = theme.accent, style}) => (
  <Cmp size={size} color={color} style={style} />
);
