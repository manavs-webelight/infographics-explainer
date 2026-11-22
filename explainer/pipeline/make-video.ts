// make-video CLI (spec section 12, M4).
// npm run make -- --id <id> [--from-scenes scenes.json] [--concept "..."]
//   [--draft] [--stop-after script|audio|render] [--force] [--voice alba]
// Steps (each skipped if done and inputs unchanged, unless --force):
//   1 setup   create projects/<id>/, save concept.txt
//   2 script  place + validate scenes.json (the agent writes it; no LLM here)
//   3 audio   synthesize + normalize + measure + write timings (audio-timing.ts)
//   4 render  Remotion render to video.tmp.mp4, rename to video.mp4
//   5 log     log.json with step timings, retries and claims (numbers used)
// Exit codes: 0 success, 1 failure (one-line reason on stderr), 2 usage.
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  renameSync,
} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateScript} from './validate.ts';
import {buildAudioAndTiming} from './audio-timing.ts';
import {injectTokens} from './highlight.ts';
import {runTrace} from './trace.ts';
import {createHash} from 'node:crypto';
import {DEFAULT_VOICE} from './tts.ts';

interface StepLog {
  name: string;
  status: 'done' | 'skipped' | 'cached' | 'failed';
  seconds?: number;
}

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
}
const has = (name: string) => argv.includes(`--${name}`);

const concept = flag('concept');
const fromScenes = flag('from-scenes');
const stopAfter = flag('stop-after');
const voice = flag('voice') ?? DEFAULT_VOICE;
const id = flag('id') ?? (concept ? slug(concept) : undefined);
const draft = has('draft');
const force = has('force');

if (!id) {
  console.error(
    'usage: npm run make -- --id <id> [--from-scenes scenes.json | --concept "..."] ' +
      '[--draft] [--stop-after script|audio|render] [--force] [--voice alba]',
  );
  process.exit(2);
}
if (stopAfter !== undefined && !['script', 'audio', 'render'].includes(stopAfter)) {
  console.error('[make] --stop-after must be script, audio or render');
  process.exit(2);
}
const stopIndex = stopAfter === undefined ? 2 : ['script', 'audio', 'render'].indexOf(stopAfter);

const projectDir = `projects/${id}`;
const scenesPath = `${projectDir}/scenes.json`;
const videoPath = `${projectDir}/video.mp4`;
const tmpVideoPath = `${projectDir}/video.tmp.mp4`;

const log: Record<string, unknown> = {
  id,
  createdAt: new Date().toISOString(),
  voice,
  draft,
  force,
  concept: concept ?? null,
  steps: [] as StepLog[],
  retries: 0, // no LLM step: the agent writes and fixes scenes.json itself
  claims: [],
};
const steps = log.steps as StepLog[];

function fail(reason: string): never {
  console.error(`[make] FAILED: ${reason}`);
  writeFileSync(
    `${projectDir}/log.json`,
    JSON.stringify({...log, status: 'failed', error: reason}, null, 2) + '\n',
  );
  process.exit(1);
}

function slug(concept: string): string {
  const base = concept
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'video'}-${new Date().toISOString().slice(0, 10)}`;
}

function collectClaims(scenes: Array<Record<string, unknown>>) {
  const claims: Array<Record<string, unknown>> = [];
  scenes.forEach((s, i) => {
    if (s.type === 'stat')
      claims.push({
        scene: i,
        kind: 'stat',
        number: `${String(s.value)}${s.suffix ? String(s.suffix) : ''}`,
        label: s.label,
      });
    if (s.type === 'chart')
      claims.push({scene: i, kind: 'chart', title: s.title, points: s.data});
  });
  return claims;
}

async function runStep(name: string, fn: () => StepLog['status'] | Promise<StepLog['status']>) {
  const t0 = Date.now();
  const status = await fn();
  steps.push({name, status, seconds: Math.round((Date.now() - t0) / 100) / 10});
}

function finish(summary: string) {
  writeFileSync(
    `${projectDir}/log.json`,
    JSON.stringify({...log, status: 'ok', summary}, null, 2) + '\n',
  );
  console.log(
    log.output
      ? `[make] ${summary}: ${String(log.output)} (${String(log.totalSeconds)}s)`
      : `[make] ${summary}`,
  );
  process.exit(0);
}

async function main() {
  // ---- 1. setup ----
  mkdirSync(`${projectDir}/audio`, {recursive: true});
  runStep('setup', () => {
    if (concept) {
      const p = `${projectDir}/concept.txt`;
      if (!existsSync(p) || readFileSync(p, 'utf8').trim() !== concept.trim()) {
        writeFileSync(p, concept.trim() + '\n');
        console.log('[setup] ok, concept.txt written');
      } else {
        console.log('[setup] ok, concept.txt unchanged');
      }
    } else {
      console.log('[setup] ok');
    }
    return 'done';
  });

  // ---- 2. script ----
  await runStep('script', () => {
    const existing = existsSync(scenesPath);
    if (existing && !force && !fromScenes) {
      const check = validateScript(readFileSync(scenesPath, 'utf8'));
      if (check.ok) {
        const n = (check.data as {scenes: unknown[]}).scenes.length;
        log.claims = collectClaims(
          (check.data as {scenes: Array<Record<string, unknown>>}).scenes,
        );
        console.log(`[script] skipped, scenes.json valid (${n} scenes)`);
        return 'skipped';
      }
      console.log('[script] existing scenes.json invalid, validating below');
    }
    if (fromScenes) {
      if (resolve(fromScenes) !== resolve(scenesPath)) {
        if (!existsSync(fromScenes))
          fail(`--from-scenes file not found: ${fromScenes}`);
        copyFileSync(fromScenes, scenesPath);
      }
    } else if (!existing) {
      fail(
        'no scenes.json and no --from-scenes: write projects/<id>/scenes.json (agent step) or pass --from-scenes',
      );
    }
    const check = validateScript(readFileSync(scenesPath, 'utf8'));
    if (!check.ok) {
      for (const e of check.errors) console.error('  ' + e);
      fail(`scenes.json failed validation (${check.errors.length} errors)`);
    }
    const n = (check.data as {scenes: unknown[]}).scenes.length;
    console.log(`[script] ok, ${n} scenes`);
    log.claims = collectClaims(
      (check.data as {scenes: Array<Record<string, unknown>>}).scenes,
    );
    return 'done';
  });

  if (stopIndex < 1) {
    finish('stopped after script');
    return;
  }

  // ---- 2.5 highlight: inject shiki tokens for code scenes (cached by hash)
  await runStep('highlight', async () => {
    const n = await injectTokens(projectDir);
    console.log(`[highlight] ${n === 0 ? 'up to date' : n + ' code scene(s) tokenized'}`);
    return n > 0 ? 'done' : 'cached';
  });

  // ---- 2.75 trace: record real states for trace scenes (cached by hash)
  await runStep('trace', async () => {
    const scenesPath = `${projectDir}/scenes.json`;
    const script = JSON.parse(readFileSync(scenesPath, 'utf8')) as {
      scenes: Array<Record<string, unknown>>;
    };
    let changed = 0;
    for (const scene of script.scenes) {
      if (scene.type !== 'trace') continue;
      const srcBytes = readFileSync(String(scene.source));
      const hash = createHash('sha256').update(srcBytes + String(scene.entry) + String(scene.args)).digest('hex').slice(0, 16);
      if (scene.trace && scene.traceHash === hash) continue;
      let res;
      try {
        res = runTrace(String(scene.source), String(scene.entry), String(scene.args), 50);
      } catch (e) {
        fail(`trace failed for ${String(scene.source)}#${String(scene.entry)}: ${e instanceof Error ? e.message : e}`);
        return;
      }
      if (res.error) {
        fail(`trace of ${String(scene.entry)} ended in an error: ${res.error} (fix the snippet or args)`);
        return;
      }
      scene.trace = {
        entry: res.entry,
        args: res.args,
        result: res.result,
        truncated: res.truncated,
        states: res.states,
      };
      scene.traceHash = hash;
      changed += 1;
    }
    if (changed > 0) {
      const tmp = `${scenesPath}.tmp`;
      writeFileSync(tmp, JSON.stringify(script, null, 2));
      renameSync(tmp, scenesPath);
    }
    console.log(`[trace] ${changed === 0 ? 'up to date' : changed + ' scene(s) recorded'}`);
    return changed > 0 ? 'done' : 'cached';
  });

  // ---- 3. audio ----
  await runStep('audio', async () => {
    const {rows} = await buildAudioAndTiming(projectDir, voice, force);
    return rows.every((r) => r.cached) ? 'cached' : 'done';
  });

  if (stopIndex < 2) {
    finish('stopped after audio');
    return;
  }

  // ---- 4. render ----
  await runStep('render', () => {
    if (existsSync(videoPath) && !force) {
      console.log('[render] skipped, video.mp4 exists (use --force to re-render)');
      return 'skipped';
    }
    const renderArgs = [
      'remotion',
      'render',
      'src/index.ts',
      'Video',
      tmpVideoPath,
      `--props=${scenesPath}`,
      `--public-dir=${projectDir}`,
      '--codec=h264',
      ...(draft ? ['--scale=0.5', '--crf=28', '--image-format=jpeg'] : ['--crf=18']),
      // Keep render off the whole machine: default half of cores is too rude
      // on a desktop. Override with REMOTION_CONCURRENCY=n.
      `--concurrency=${process.env.REMOTION_CONCURRENCY ?? '2'}`,
    ];
    try {
      execFileSync('npx', renderArgs, {stdio: 'inherit'});
    } catch {
      rmSync(tmpVideoPath, {force: true}); // never leave a half-written file
      fail('render failed (no video.mp4 written)');
    }
    execFileSync('mv', [tmpVideoPath, videoPath]); // rename only when complete
    console.log(`[render] ok, ${draft ? 'draft' : 'final'} -> ${videoPath}`);
    return 'done';
  });

  // ---- 4b. contact sheet (drafts only: the thing the user reviews before the final) ----
  if (draft) {
    await runStep('sheet', () => {
      execFileSync('node', ['--no-warnings', 'pipeline/contact-sheet.ts', projectDir], {stdio: 'inherit'});
      return 'done';
    });
  }

  // ---- 5. summary ----
  if (existsSync(`${projectDir}/audio-timing.json`)) {
    const timing = JSON.parse(
      readFileSync(`${projectDir}/audio-timing.json`, 'utf8'),
    ) as Array<{durationInFrames: number}>;
    const total =
      timing.reduce((s, r) => s + r.durationInFrames, 0) -
      12 * Math.max(0, timing.length - 1);
    log.output = videoPath;
    log.totalFrames = total;
    log.totalSeconds = Math.round((total / 30) * 10) / 10;
  }
  finish('done');
}

main().catch((e) => fail((e as Error).message));
