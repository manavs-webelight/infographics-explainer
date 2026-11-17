import {AbsoluteFill} from 'remotion';
import {theme} from '../theme';
export const Layout: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill style={{background: theme.bg, fontFamily: theme.font, color: theme.text, padding: 120, justifyContent: 'center'}}>
    {children}
  </AbsoluteFill>
);
