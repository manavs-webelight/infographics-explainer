// Static subtitle timing for video.srt: no speech recognition. The narration text and each clip's
// length are known, so split the text into short phrases and share the clip's
// time between them by length (plus a small pause weight after punctuation).
export type Phrase = {text: string; weight: number};

const MAX_WORDS = 8;
const MIN_WORDS = 3;
const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Words a phrase should not END on / is happy to START with.
const WEAK_END = new Set('a an the each of to in on for with whether that and or but is are was were be it its this their your his her our'.split(' '));
const GOOD_START = new Set('and but because whether that when if which while so then to with before after until from'.split(' '));
const bare = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');

// Split a long clause near its middle, preferring a break before a conjunction/preposition
// and never right after a dangling word like "a" or "whether"; recurse until short enough.
function splitClause(words: string[]): string[] {
  if (words.length <= MAX_WORDS) return [words.join(' ')];
  const n = words.length;
  let best = Math.floor(n / 2), bestCost = Infinity;
  for (let k = MIN_WORDS; k <= n - MIN_WORDS; k++) {
    const cost = Math.abs(k - n / 2) + (WEAK_END.has(bare(words[k - 1])) ? 3 : 0) - (GOOD_START.has(bare(words[k])) ? 1.5 : 0);
    if (cost < bestCost) [best, bestCost] = [k, cost];
  }
  return [...splitClause(words.slice(0, best)), ...splitClause(words.slice(best))];
}

export function splitPhrases(text: string): Phrase[] {
  const clauses = text.trim().match(/[^,.;:!?]+[,.;:!?]*/g) ?? [text.trim()];
  const chunks = clauses.flatMap((c) => splitClause(c.trim().split(/\s+/).filter(Boolean)));
  const merged: string[] = [];
  let carry = ''; // a too-short chunk with nowhere to merge backwards rides along with the next one
  for (const raw of chunks) {
    const c = carry ? `${carry} ${raw}` : raw;
    carry = '';
    const prev = merged[merged.length - 1];
    if (wc(c) >= MIN_WORDS) merged.push(c);
    else if (prev !== undefined && wc(prev) + wc(c) <= MAX_WORDS + 2) merged[merged.length - 1] = `${prev} ${c}`;
    else carry = c;
  }
  if (carry) merged.push(carry);
  return merged.map((t) => ({
    text: t,
    weight: t.length + (/[.!?]$/.test(t) ? 10 : /[,;:]$/.test(t) ? 5 : 0),
  }));
}

// [start, end] of each phrase as fractions (0..1) of the clip.
export function phraseSpans(phrases: Phrase[]): Array<[number, number]> {
  const total = phrases.reduce((s, p) => s + p.weight, 0) || 1;
  let acc = 0;
  return phrases.map((p) => {
    const start = acc / total;
    acc += p.weight;
    return [start, acc / total];
  });
}
