// M8 trace tool: run ONE python function and record up to 50 execution
// states via sys.settrace (pipeline/trace-harness.py), inside a subprocess:
//   - fresh temp working dir (script is COPIED there, never run in place)
//   - 5s wall timeout + RLIMIT_CPU/RLIMIT_AS/RLIMIT_FSIZE (harness self-applies)
//   - network blocked: socket kill-switch in the harness, plus OS-level
//     network namespace via `unshare -rn` when available on this machine
//   - only code inside this project may run (path guard below); pasted code
//     comes via --code which we write into the temp dir ourselves.
// CLI: node pipeline/trace.ts --script snippets/x.py --entry f --args '1, 2' [--max-states 50] [--out trace.json]
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';

export type TraceState = {
  n: number;
  event: 'line' | 'return';
  func: string;
  line: number;
  vars: Record<string, string>;
  returns?: string;
};
export type TraceResult = {
  entry: string;
  args: string;
  limit: number;
  truncated: boolean;
  error: string | null;
  result: string | null;
  states: TraceState[];
  network: 'unshare' | 'socket-guard';
  durationMs: number;
};

const HARNESS = join(import.meta.dirname, 'trace-harness.py');

const assertInsideProject = (scriptPath: string): string => {
  const root = resolve(process.cwd());
  const abs = resolve(scriptPath);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel) || rel === '')
    throw new Error(
      `trace refuses to run "${scriptPath}": only code inside this project may run (ask the user before running anything else)`,
    );
  if (!abs.endsWith('.py')) throw new Error('trace runs .py files only');
  if (!existsSync(abs)) throw new Error(`trace: script not found: ${scriptPath}`);
  return abs;
};

const unshareAvailable = (): boolean => {
  try {
    execFileSync('unshare', ['-rn', 'true'], {stdio: 'ignore', timeout: 3000});
    return true;
  } catch {
    return false;
  }
};

// Run `code` (a string, e.g. pasted by the user) - written into the temp dir.
export const runTraceOnCode = (
  code: string,
  entry: string,
  args: string,
  maxStates = 50,
): TraceResult => {
  const dir = mkdtempSync(join(tmpdir(), 'explainer-trace-'));
  try {
    const scriptCopy = join(dir, 'snippet.py');
    writeFileSync(scriptCopy, code);
    return finishTrace(scriptCopy, dir, entry, args, maxStates);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
};

// Run a project file (path-guarded).
export const runTrace = (
  scriptPath: string,
  entry: string,
  args: string,
  maxStates = 50,
): TraceResult => {
  const abs = assertInsideProject(scriptPath);
  const dir = mkdtempSync(join(tmpdir(), 'explainer-trace-'));
  try {
    const scriptCopy = join(dir, abs.split('/').pop() ?? 'snippet.py');
    copyFileSync(abs, scriptCopy);
    return finishTrace(scriptCopy, dir, entry, args, maxStates);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
};

const finishTrace = (
  scriptCopy: string,
  dir: string,
  entry: string,
  args: string,
  maxStates: number,
): TraceResult => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry))
    throw new Error(`trace: invalid entry name "${entry}"`);
  if (args.length > 200) throw new Error('trace: args literal too long');
  const net = unshareAvailable();
  const pyArgs = [HARNESS, scriptCopy, entry, args, String(maxStates), '512', '5'];
  const cmd = net ? ['unshare', '-rn', 'python3', ...pyArgs] : ['python3', ...pyArgs];
  const [bin, ...rest] = cmd;
  const t0 = Date.now();
  const proc = spawnSync(bin, rest, {
    cwd: dir,
    timeout: 5500, // wall clock; harness enforces 5s CPU + memory via rlimits
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
  });
  const durationMs = Date.now() - t0;
  if (proc.error || proc.status === null)
    throw new Error(
      `trace failed (killed by timeout or resource limits)${proc.error ? ': ' + proc.error.message : ''}`,
    );
  const outPath = join(dir, 'trace-out.json');
  if (!existsSync(outPath))
    throw new Error(`trace failed: ${proc.stderr?.slice(0, 300) ?? 'no output'}`);
  const result = JSON.parse(readFileSync(outPath, 'utf8')) as TraceResult;
  result.network = net ? 'unshare' : 'socket-guard';
  result.durationMs = durationMs;
  if (result.error !== null && proc.status === 3)
    result.error = result.error; // user exception is REPORTED, not thrown
  return result;
};

// ---------------- CLI ----------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const script = flag('script');
  const codeFile = flag('code-file'); // for pasted code saved by the agent
  const entry = flag('entry');
  const args = flag('args') ?? '()';
  const maxStates = Number(flag('max-states') ?? '50');
  if ((!script && !codeFile) || !entry) {
    console.error(
      'usage: npm run trace -- --script snippets/x.py --entry f --args "1, 2" [--max-states 50] [--code-file f | --out t.json]',
    );
    process.exit(2);
  }
  try {
    const res = codeFile
      ? runTraceOnCode(readFileSync(codeFile, 'utf8'), String(entry), args, maxStates)
      : runTrace(String(script), String(entry), args, maxStates);
    const line = (s: TraceState) =>
      `${String(s.n).padStart(2)}  ${s.event.padEnd(6)} ln ${String(s.line).padStart(3)}  ${s.func}  ${
        Object.entries(s.vars)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')
      }${s.returns ? ` -> ${s.returns}` : ''}`;
    console.log(`trace ${res.entry}(${res.args}): ${res.states.length} states${res.truncated ? ' (TRUNCATED at limit)' : ''}${res.error ? ` ERROR: ${res.error}` : ''}${res.result !== null ? ` result=${res.result}` : ''}`);
    console.log(`sandbox: temp-dir, 5s timeout, 512MB, network=${res.network}, ${res.durationMs}ms`);
    for (const s of res.states) console.log(line(s));
    const out = flag('out');
    if (out) {
      writeFileSync(out, JSON.stringify(res, null, 1));
      console.log(`[trace] wrote ${out}`);
    }
  } catch (e) {
    console.error('[trace] failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
