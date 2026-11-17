// Audio + timing step (spec section 9 + M5 step-level narration).
// CLI: node pipeline/audio-timing.ts projects/<id> [--voice alba] [--force]
// For each scene it synthesizes narration SEQUENTIALLY (Pocket TTS is not
// thread-safe), one clip per scene narration or per step (cache key
// hash(text+voice)), measures each WAV with ffprobe, then writes audio
// fields back into scenes.json:
//   classic scene: audioFile, audioSeconds, durationInFrames
//   stepped scene: steps[m].{audioFile, audioSeconds, startFrame, frames} and
//     the scene durationInFrames (LEAD + sum(step audio + 6-frame gaps) + TAIL).
// Reused by the M4 make-video CLI.
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {synthesize, DEFAULT_VOICE} from './tts.ts';
import {validateScript} from './validate.ts';

// Timing constants (spec section 9 + M5).
export const FPS = 30;
export const T = 12; // transition frames
export const LEAD = 16; // first narration starts after the incoming transition
export const TAIL = 18; // narration ends before the outgoing transition
export const TAIL_LAST = 30; // extra tail room for the final scene
export const STEP_GAP = 6; // silence between back-to-back step clips

function inputHash(text: string, voice: string): string {
  return createHash('sha256').update(text + '|' + voice).digest('hex').slice(0, 16);
}

function execProbeDuration(file: string): string {
  return execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    {stdio: ['ignore', 'pipe', 'pipe']},
  ).toString().trim();
}

interface Clip {
  durationSec: number;
  cached: boolean;
}

// Synthesize (or reuse) one narration clip at projectDir/<relFile>.
async function synthClip(
  projectDir: string,
  relFile: string,
  text: string,
  voice: string,
  force: boolean,
): Promise<Clip> {
  const outPath = join(projectDir, relFile);
  const hash = inputHash(text, voice);
  const hashPath = outPath + '.sha256';
  if (
    !force &&
    existsSync(outPath) &&
    existsSync(hashPath) &&
    readFileSync(hashPath, 'utf8').trim() === hash
  ) {
    return {durationSec: parseFloat(execProbeDuration(outPath)), cached: true};
  }
  const r = await synthesize(text, outPath, {voice});
  writeFileSync(hashPath, hash + '\n');
  return {durationSec: r.durationSec, cached: false};
}

interface SceneJson {
  title?: string;
  scenes: Array<Record<string, unknown>>;
}

type StepRow = {
  step: number;
  audioSeconds: number;
  startFrame: number;
  frames: number;
  cached: boolean;
};
type Row = {
  scene: number;
  voice: string;
  audioSeconds: number;
  audioFrames: number;
  durationInFrames: number;
  tail: number;
  marginFrames: number;
  cached: boolean;
  steps?: StepRow[];
};

export async function buildAudioAndTiming(
  projectDir: string,
  voice = DEFAULT_VOICE,
  force = false,
) {
  const scenesPath = join(projectDir, 'scenes.json');
  const raw = readFileSync(scenesPath, 'utf8');
  const check = validateScript(raw);
  if (!check.ok) {
    console.error('[audio] refusing to synthesize: scenes.json is invalid');
    for (const e of check.errors) console.error('  ' + e);
    process.exit(1);
  }
  const script = JSON.parse(raw) as SceneJson;
  const audioDir = join(projectDir, 'audio');
  if (!existsSync(audioDir)) mkdirSync(audioDir, {recursive: true});

  const rows: Row[] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const tail = i === script.scenes.length - 1 ? TAIL_LAST : TAIL;
    const stepped = Array.isArray(scene.steps) && typeof scene.steps[0] === 'object';
    console.log(
      `[audio] ${i + 1}/${script.scenes.length} ${stepped ? 'steps: ' + (scene.steps as unknown[]).length : 'narration'} (voice ${voice})`,
    );

    if (stepped) {
      const steps = scene.steps as Array<Record<string, unknown>>;
      let cursor = LEAD;
      const stepRows: StepRow[] = [];
      let allCached = true;
      let totalSec = 0;
      for (let m = 0; m < steps.length; m++) {
        const st = steps[m];
        const narration = String(st.narration);
        const clip = await synthClip(
          projectDir,
          `audio/scene-${i}-step-${m}.wav`,
          narration,
          voice,
          force,
        );
        if (!clip.cached) allCached = false;
        const frames = Math.ceil(clip.durationSec * FPS);
        st.audioFile = `audio/scene-${i}-step-${m}.wav`;
        st.audioSeconds = Math.round(clip.durationSec * 1000) / 1000;
        st.startFrame = cursor;
        st.frames = frames;
        stepRows.push({step: m, audioSeconds: clip.durationSec, startFrame: cursor, frames, cached: clip.cached});
        cursor += frames + (m < steps.length - 1 ? STEP_GAP : 0);
        totalSec += clip.durationSec;
      }
      delete scene.audioFile; // stepped scenes carry per-step audio only
      delete scene.audioSeconds;
      const lastEnd = cursor; // end of last step clip
      const durationInFrames = Math.max(60, lastEnd + tail);
      scene.durationInFrames = durationInFrames;
      const audioFrames = lastEnd - LEAD;
      rows.push({
        scene: i,
        voice,
        audioSeconds: totalSec,
        audioFrames,
        durationInFrames,
        tail,
        marginFrames: durationInFrames - lastEnd,
        cached: allCached,
        steps: stepRows,
      });
      continue;
    }

    // classic scene-level narration
    const narration = String(scene.narration);
    const relFile = `audio/scene-${i}.wav`;
    const clip = await synthClip(projectDir, relFile, narration, voice, force);
    const audioFrames = Math.ceil(clip.durationSec * FPS);
    const durationInFrames = Math.max(60, LEAD + audioFrames + tail);
    scene.audioFile = relFile;
    scene.audioSeconds = Math.round(clip.durationSec * 1000) / 1000;
    scene.durationInFrames = durationInFrames;
    rows.push({
      scene: i,
      voice,
      audioSeconds: clip.durationSec,
      audioFrames,
      durationInFrames,
      tail,
      marginFrames: durationInFrames - LEAD - audioFrames,
      cached: clip.cached,
    });
  }

  writeFileSync(scenesPath, JSON.stringify(script, null, 2) + '\n');
  writeFileSync(join(projectDir, 'audio-timing.json'), JSON.stringify(rows, null, 2) + '\n');

  console.log(
    `[audio] done: ${rows.length} scenes | margin = silent frames after last spoken words (needs >= ${T})`,
  );
  for (const r of rows) {
    const cutoff = r.marginFrames < T ? '  ** RISK OF CUTOFF **' : '';
    console.log(
      `[audio] scene ${r.scene}${r.cached ? ' (cached)' : ''}: ${r.audioSeconds.toFixed(2)}s speech=${r.audioFrames}f scene=${r.durationInFrames}f lead=16 tail=${r.tail} margin=${r.marginFrames}f${cutoff}`,
    );
    for (const st of r.steps ?? [])
      console.log(
        `[audio]   step ${st.step}${st.cached ? ' (cached)' : ''}: ${st.audioSeconds.toFixed(2)}s start=${st.startFrame}f len=${st.frames}f`,
      );
  }
  const total = rows.reduce((s, r) => s + r.durationInFrames, 0) - T * (rows.length - 1);
  console.log(`[audio] total composition length: ${total} frames (${(total / FPS).toFixed(1)}s)`);
  return {rows, total};
}

if (process.argv[1] && process.argv[1].endsWith('audio-timing.ts')) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node pipeline/audio-timing.ts projects/<id> [--voice alba] [--force]');
    process.exit(2);
  }
  const vIdx = process.argv.indexOf('--voice');
  const voice = vIdx !== -1 ? process.argv[vIdx + 1] : DEFAULT_VOICE;
  const force = process.argv.includes('--force');
  buildAudioAndTiming(dir, voice, force).catch((e) => {
    console.error(`[audio] FAILED: ${(e as Error).message}`);
    process.exit(1);
  });
}
