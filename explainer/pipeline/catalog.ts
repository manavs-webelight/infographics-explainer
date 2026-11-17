// npm run catalog
// Prints every scene type, its fields/limits (as JSON Schema generated from
// the zod schema, so it can never drift) and one valid example per shape.
// Examples live in pipeline/examples/*.json and are validated on the way out:
// an example that no longer fits the schema makes the catalog FAIL.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {SceneSchema, sceneTypes} from '../schema/scene-schema.ts';

const examplesDir = 'pipeline/examples';
const files = readdirSync(examplesDir).filter((f) => f.endsWith('.json'));

const byType = new Map<string, Array<{file: string; scene: unknown}>>();
for (const file of files) {
  const scene = JSON.parse(readFileSync(join(examplesDir, file), 'utf8'));
  const parsed = SceneSchema.safeParse(scene);
  if (!parsed.success) {
    console.error(`example ${file} does not match the schema:`);
    for (const iss of parsed.error.issues) {
      console.error(`  ${String(iss.path.join('.'))}: ${iss.message}`);
    }
    process.exit(1);
  }
  const t = String((scene as {type: string}).type);
  if (!byType.has(t)) byType.set(t, []);
  byType.get(t)!.push({file, scene});
}

console.log('# Scene catalog (generated from schema/scene-schema.ts)');
console.log('');
console.log('A scene uses EXACTLY ONE of: one scene-level "narration" (12-60 words)');
console.log('or "steps" (each step carries its own narration, 6-40 words each).');
console.log('flow/bullets are capped at 5 steps (items on screen); other types 2-8.');
console.log('');

for (const type of sceneTypes) {
  const option = SceneSchema.options.find(
    (o) => (o.shape.type as {value: string}).value === type,
  );
  console.log(`## type: ${type}`);
  console.log(JSON.stringify(z.toJSONSchema(option as never, {io: 'input'}), null, 1));
  const ex = byType.get(type) ?? [];
  for (const e of ex) {
    console.log(`--- example (${e.file}) ---`);
    console.log(JSON.stringify(e.scene, null, 2));
  }
  if (!ex.length) {
    console.log('--- NO EXAMPLE FOUND (add pipeline/examples one for this type) ---');
  }
  console.log('');
}
