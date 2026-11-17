// npm run contact-sheet -- projects/<id>
// Renders one still per scene (after its entrance) and one per step start,
// tiles them into ONE image with ffmpeg, and prints a legend. Look at the
// sheet before every final render. Requires scenes.json WITH pipeline timings.
import {readFileSync, mkdirSync, rmSync, existsSync, renameSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';

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
        label: `scene ${i} step ${String(st.item ?? (Array.isArray(st.focus) ? st.focus.slice(0, 2).join(' ') : ''))} start @${sf}`,
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
shots.forEach((shot, n) => {
  const out = join(tmp, `${String(n).padStart(3, '0')}.png`);
  execFileSync(
    'npx',
    [
      'remotion', 'still', 'src/index.ts', 'Video', out,
      `--frame=${shot.frame}`,
      `--props=${scenesPath}`,
      `--public-dir=${dir}`,
      '--scale=0.5',
    ],
    {stdio: 'ignore'},
  );
  // Burn the label INTO the tile so tile order can never be misread.
  const label = `[${n}] ${shot.label}`.replace(/[\\:']/g, ' ');
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', out,
    '-vf',
    `drawtext=fontfile=${FONT}:text='${label}':x=10:y=6:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.75`,
    out + '.labelled.png', // ffmpeg refuses to read and write the same path
  ], {stdio: 'inherit'});
  renameSync(out + '.labelled.png', out);
  console.log(`[contact-sheet] ${n + 1}/${shots.length}: ${shot.label}`);
});

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
