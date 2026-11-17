// Focus style shared by all stepped diagrams:
// active item = full opacity; revealed-but-not-active stays visible, dimmed.
export const FocusDim: React.FC<{
  active: boolean;
  dim?: number;
  children: React.ReactNode;
}> = ({active, dim = 0.35, children}) => (
  <div style={{opacity: active ? 1 : dim, width: '100%', height: '100%'}}>{children}</div>
);
