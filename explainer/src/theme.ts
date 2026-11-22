// Light, minimal palette (Claude brand: ivory ground, terracotta accent).
// Hex values from the user's palette image: D97757, F4F3EE, B1ADA1, FFFFFF.
// muted/accent2/soft are DERIVED so text keeps contrast on ivory: warm grey
// B1ADA1 is only ~2:1 there, so it is for borders/arrows/dim states, never text.
export const theme = {
  bg: '#F4F3EE',
  card: '#FFFFFF',
  text: '#141413',
  muted: '#6B675D', // text-safe warm grey
  line: '#B1ADA1', // borders, arrows, baselines (not text)
  accent: '#D97757',
  accent2: '#B4532F', // deep terracotta: emphasis / active / small text
  soft: '#F6E2D9', // terracotta tint: active row background
  shadow: '0 1px 2px rgba(20,20,19,0.06), 0 10px 28px rgba(20,20,19,0.07)',
  font: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
};
