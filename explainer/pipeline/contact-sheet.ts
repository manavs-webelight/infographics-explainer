// npm run contact-sheet -- projects/<id>
// Renders one still per scene (after its entrance) and one per step start,
// tiles them into ONE image with ffmpeg, and prints a legend. Look at the
// sheet before every final render. Requires scenes.json WITH pipeline timings.
import {readFileSync, mkdirSync, rmSync, existsSync, renameSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join, resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: npm run contact-sheet -- projects/<id>');
  process.exit(2);
}
const scenesPath = join(dir, 'scenes.json');
if (!existsSync(scenesPath)) {
  console.error(`no ${scenesPath}`);
  process.exit(2);
}
const script = JSON.parse(readFileSync(scenesPath, 'utf8')) as {
  scenes: Array<Record<string, unknown>>;
};
const scenes = script.scenes;
if (!scenes.every((s) => typeof s.durationInFrames === 'number')) {
  console.error('scenes.json has no durations; run make (audio step) first');
  process.exit(2);
}

const T = 12;
type Shot = {frame: number; label: string};
const shots: Shot[] = [];
let g = 0;
scenes.forEach((s, i) => {
  const dur = s.durationInFrames as number;
  const stepped = Array.isArray(s.steps) && typeof s.steps[0] === 'object';
  // after-entrance / mid-scene state
  const mid = Math.min(g + 50, g + dur - 13);
  shots.push({frame: mid, label: `scene ${i} (${s.type}) mid @${mid}`});
  if (stepped) {
    for (const st of s.steps as Array<Record<string, unknown>>) {
      const sf = g + Number(st.startFrame ?? 0);
      shots.push({
        frame: Math.min(sf + 20, g + dur - 13),
        label: `scene ${i} step ${String(st.item ?? st.when ?? (Array.isArray(st.focus) ? st.focus.slice(0, 2).join(' ') : st.toMessage !== undefined ? `to message ${String(st.toMessage)}` : st.row !== undefined || st.col !== undefined ? `row ${String(st.row ?? '-')} col ${String(st.col ?? '-')}` : ''))} start @${sf}`,
      });
    }
  }
  g += dur - T;
});

const sheet = join(dir, 'contact-sheet.png');
const tmp = 'out/contact-tmp-' + Date.now();
rmSync('out/contact-tmp', {recursive: true, force: true});
rmSync(tmp, {recursive: true, force: true});
mkdirSync(tmp, {recursive: true});
if (existsSync(sheet)) rmSync(sheet); // never trust a stale sheet

const cols = 4;
const rows = Math.ceil(shots.length / cols);
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
// Bundle ONCE and reuse ONE browser for every still (was: one `remotion still`
// process, and so one full bundle, per shot).
const serveUrl = await bundle({entryPoint: resolve('src/index.ts'), publicDir: resolve(dir)});
const browser = await openBrowser('chrome', {chromiumOptions: {gl: 'swiftshader'}});
const inputProps = script as unknown as Record<string, unknown>;
const composition = await selectComposition({serveUrl, id: 'Video', inputProps, puppeteerInstance: browser});
for (const [n, shot] of shots.entries()) {
  const out = join(tmp, `${String(n).padStart(3, '0')}.png`);
  await renderStill({composition, serveUrl, frame: shot.frame, output: out, scale: 0.5, inputProps, puppeteerInstance: browser});
  // Burn the label INTO the tile so tile order can never be misread.
  const label = `[${n}] ${shot.label}`.replace(/[\\\\:']/g, ' ');
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', out,
    '-vf',
    `drawtext=fontfile=${FONT}:text='${label}':x=10:y=6:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.75`,
    out + '.labelled.png', // ffmpeg refuses to read and write the same path
  ], {stdio: 'inherit'});
  renameSync(out + '.labelled.png', out);
  console.log(`[contact-sheet] ${n + 1}/${shots.length}: ${shot.label}`);
}
await browser.close({silent: true});

execFileSync('ffmpeg', [
  '-y', '-v', 'error',
  '-i', join(tmp, '%03d.png'),
  '-filter_complex', `tile=${cols}x${rows}:padding=6:color=white`,
  '-frames:v', '1',
  sheet,
]);
rmSync(tmp, {recursive: true, force: true});

console.log(`\n[contact-sheet] ${shots.length} shots -> ${sheet}`);
shots.forEach((s, n) => console.log(`  [${n}] ${s.label} (frame ${s.frame})`));
