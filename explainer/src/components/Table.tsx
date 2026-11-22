import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Check, Minus} from 'lucide-react';
import {Layout} from './Layout';
import {useIn, useStep} from '../anim';
import {theme} from '../theme';

// Comparison / matrix table. Fully visible from the start; each step focuses a
// data row, a column or one cell (1-based; column 1 holds the row labels) and
// dims the rest. Cell text wraps to at most 2 lines at TABLE_FONT (schema caps
// a cell at 36 characters, a header at 20, so 4 columns still fit). A cell that
// is exactly "yes" or "no" shows a check or dash icon.
type TStep = {row?: number; col?: number; startFrame?: number; frames?: number};

const TABLE_FONT = 30; // >= 28px floor
const HEAD_FONT = 28;
const ROW_H = 104;
const HEAD_H = 84;
const DIM = 0.45;

const covers = (st: TStep, r: number, c: number): boolean =>
  (st.row === undefined || st.row === r) && (st.col === undefined || st.col === c);

// Header cells (r = 0) light up only for column focus.
const onFor = (st: TStep, r: number, c: number): boolean =>
  r === 0 ? st.row === undefined && st.col === c : covers(st, r, c);

export const Table: React.FC<any> = (props) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const heading = useIn(0);
  const steps = (props.steps ?? []) as TStep[];
  const {index} = useStep(steps);
  const title = props.title as string | undefined;
  const columns = (props.columns ?? []) as string[];
  const rows = (props.rows ?? []) as string[][];

  const total = HEAD_H + rows.length * ROW_H;
  const availTop = title ? 230 : 100;
  const top = availTop + (1080 - availTop - 100 - total) / 2;
  const colW = 1680 / columns.length;

  // Per cell, per step: target state 'on' (1) or 'dim' (DIM). Before step 0
  // every cell is neutral (1). The change is a frame-driven spring from the
  // step that flipped it (same approach as the code scene).
  const cellState = (r: number, c: number) => {
    let prev = 1;
    let flip = 0;
    let cur = 1;
    for (let k = 0; k <= index; k++) {
      const next = onFor(steps[k], r, c) ? 1 : DIM;
      if (next !== cur) {
        prev = cur;
        cur = next;
        flip = steps[k].startFrame ?? 0;
      }
    }
    const grow = spring({frame: frame - flip, fps, config: {damping: 200}});
    const opacity = prev + (cur - prev) * grow;
    const on = index >= 0 && onFor(steps[index], r, c);
    return {opacity, on, grow};
  };

  const cellBody = (text: string, bold: boolean, color: string) => {
    if (text === 'yes') return <Check size={40} color={theme.accent2} strokeWidth={2.6} />;
    if (text === 'no') return <Minus size={40} color={theme.muted} strokeWidth={2.6} />;
    return (
      <span style={{fontWeight: bold ? 700 : 500, color, lineHeight: 1.25}}>{text}</span>
    );
  };

  const renderRow = (cells: string[], r: number) => {
    const rowIn = spring({frame: frame - (10 + r * 6), fps, config: {damping: 200}});
    return (
      <div
        key={r}
        style={{
          display: 'flex',
          height: r === 0 ? HEAD_H : ROW_H,
          borderTop: r === 0 ? 'none' : `1.5px solid ${theme.line}55`,
          opacity: rowIn,
          transform: `translateY(${(1 - rowIn) * 24}px)`,
        }}
      >
        {cells.map((text, c0) => {
          const c = c0 + 1;
          const {opacity, on, grow} = cellState(r, c);
          const header = r === 0;
          return (
            <div
              key={c}
              style={{
                width: colW,
                boxSizing: 'border-box',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                fontSize: header ? HEAD_FONT : TABLE_FONT,
                letterSpacing: header ? '0.01em' : undefined,
                background: on ? theme.soft : 'transparent',
                opacity: on ? 0.55 + 0.45 * grow : opacity,
              }}
            >
              {cellBody(text, header || c === 1, header ? theme.muted : theme.text)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Layout>
      {title && (
        <div style={{position: 'absolute', top: 64, left: 120, width: 1680, opacity: heading}}>
          <div style={{width: 72, height: 8, background: theme.accent, borderRadius: 4, marginBottom: 18}} />
          <div style={{fontSize: 64, fontWeight: 700, color: theme.text}}>{title}</div>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top,
          left: 120,
          width: 1680,
          background: theme.card,
          borderRadius: 24,
          boxShadow: theme.shadow,
          overflow: 'hidden',
          border: `1.5px solid ${theme.line}55`,
        }}
      >
        {renderRow(columns, 0)}
        {rows.map((cells, i) => renderRow(cells, i + 1))}
      </div>
    </Layout>
  );
};
