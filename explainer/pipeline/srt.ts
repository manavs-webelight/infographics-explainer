// Write <project>/video.srt from the timed scenes.json (same phrase timing as the on-screen captions).
import {readFileSync, writeFileSync} from 'node:fs';
import {phraseSpans, splitPhrases} from '../src/captions.ts';

const FPS = 30, T = 12, LEAD = 16; // kept in sync with src/Video.tsx
const stamp = (sec: number) => {
  const ms = Math.round(sec * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function writeSrt(projectDir: string): number {
  const {scenes} = JSON.parse(readFileSync(`${projectDir}/scenes.json`, 'utf8')) as {scenes: Array<Record<string, any>>};
  const out: string[] = [];
  let sceneStart = 0; // frames
  const clip = (text: string, startFrame: number, frames: number) => {
    const phrases = splitPhrases(text);
    phraseSpans(phrases).forEach(([a, b], k) => {
      out.push(`${out.length + 1}\n${stamp((startFrame + a * frames) / FPS)} --> ${stamp((startFrame + b * frames) / FPS)}\n${phrases[k].text}\n`);
    });
  };
  scenes.forEach((s, i) => {
    if (Array.isArray(s.steps) && typeof s.steps[0] === 'object')
      for (const st of s.steps) clip(String(st.narration), sceneStart + Number(st.startFrame), Number(st.frames));
    else clip(String(s.narration), sceneStart + LEAD, Math.ceil(Number(s.audioSeconds) * FPS));
    sceneStart += Number(s.durationInFrames) - T;
  });
  writeFileSync(`${projectDir}/video.srt`, out.join('\n'));
  return out.length;
}
