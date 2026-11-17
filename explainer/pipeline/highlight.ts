// Pre-tokenize code scenes with shiki (exact-pinned) so the Remotion bundle
// never needs shiki itself: tokens are injected into scenes.json as opaque
// [text, color] runs plus a codeHash; unchanged code is never re-tokenized.
// CLI: node pipeline/highlight.ts projects/<id>
import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {codeToTokens, type BundledLanguage} from 'shiki';

const THEME = 'github-dark';

export const injectTokens = async (projectDir: string): Promise<number> => {
  const scenesPath = `${projectDir}/scenes.json`;
  const script = JSON.parse(readFileSync(scenesPath, 'utf8')) as {
    scenes: Array<Record<string, unknown>>;
  };
  let changed = 0;
  for (const scene of script.scenes) {
    if (scene.type !== 'code' && scene.type !== 'trace') continue;
    const lang = String(scene.lang ?? 'python');
    const code = String(scene.code ?? '');
    const hash = createHash('sha256').update(code + lang).digest('hex').slice(0, 16);
    if (scene.tokens && scene.codeHash === hash) continue;
    // schema restricts lang to this bundled set
    const res = await codeToTokens(code, {lang: lang as BundledLanguage, theme: THEME});
    scene.tokens = res.tokens.map((line) => line.map((t) => [t.content, t.color ?? null]));
    scene.codeHash = hash;
    changed += 1;
  }
  if (changed > 0) {
    const tmp = `${scenesPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(script, null, 2));
    renameSync(tmp, scenesPath);
  }
  return changed;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node pipeline/highlight.ts projects/<id>');
    process.exit(2);
  }
  injectTokens(dir)
    .then((n) => console.log(`[highlight] ${n} code scene(s) tokenized`))
    .catch((e) => {
      console.error('[highlight] failed:', e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
