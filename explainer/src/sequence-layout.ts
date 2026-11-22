// ONE source of truth for the sequence scene geometry, shared by the component
// and the validator (same idea as graph-layout.ts). Pure numbers, no React.
export const SEQ_FONT = 28; // message labels (>= 28px floor)
export const ACTOR_FONT = 30;
export const BOX_W = 300;
export const BOX_H = 72;
export const REVEAL_GAP = 14; // frames between messages revealed by one step

// Actor centers: evenly spaced between x=240 and x=1680 (box fits inside 1920).
export const actorXs = (n: number): number[] =>
  Array.from({length: n}, (_, i) => (n === 1 ? 960 : 240 + (i * 1440) / (n - 1)));

// Longest label that fits between two lifelines `span` px apart (Inter averages
// about 0.6em per glyph at weight 600; 40px keeps it off the lifelines).
export const labelMaxChars = (span: number): number =>
  Math.floor((span - 40) / (0.6 * SEQ_FONT));

export const seqLayout = (nMsgs: number, hasTitle: boolean) => {
  const availTop = hasTitle ? 230 : 110;
  const availH = 1080 - 100 - availTop;
  const rowH = Math.min(110, Math.floor((availH - BOX_H - 20) / Math.max(1, nMsgs)));
  // Center the whole diagram vertically in the free area (few messages sit mid-canvas).
  const used = BOX_H + 20 + nMsgs * rowH;
  const boxY = availTop + Math.max(0, Math.floor((availH - used) / 2));
  const slotTop = boxY + BOX_H + 20;
  return {boxY, slotTop, rowH, lifelineEnd: slotTop + nMsgs * rowH};
};
