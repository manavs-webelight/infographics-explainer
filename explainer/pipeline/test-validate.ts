// Fixture test for the validator (M2 gate evidence).
// Run: npm run test:validate
// Each broken fixture must be rejected with its expected section-10 message,
// and the valid fixture must pass.
import {execFileSync} from 'node:child_process';

interface FixtureCase {
  file: string;
  expectOk: boolean;
  expect?: string[]; // substrings that must appear in the validator output
}

const cases: FixtureCase[] = [
  {file: 'valid.json', expectOk: true},
  {file: 'wrong-type.json', expectOk: false, expect: ['unknown scene type "carousel"']},
  {file: 'missing-field.json', expectOk: false, expect: ['scenes[1].label']},
  {file: 'too-many-items.json', expectOk: false, expect: ['scenes[3].steps: must have at most 5 items (got 7)']},
  {file: 'over-long-text.json', expectOk: false, expect: ['scenes[0].text: must be at most 60 characters (got ']},
  {file: 'wrong-first-scene.json', expectOk: false, expect: ['scenes[0]: first scene must be type "title"']},
  {
    file: 'tts-text-hygiene.json',
    expectOk: false,
    expect: [
      'scenes[1].narration: spell it out for the voice',
      'scenes[4].narration: spell it out for the voice',
    ],
  },
  {file: 'stepped-valid.json', expectOk: true},
  {file: 'stepped-both.json', expectOk: false, expect: ['scenes[1]: provide either narration or steps, not both']},
  {file: 'stepped-words.json', expectOk: false, expect: ['scenes[1].steps[0].narration: word count 4 is outside 6-40']},
  {file: 'stepped-too-many.json', expectOk: false, expect: ['scenes[1].steps: must have at most 5 items (got 6)']},
  {file: 'stepped-item-long.json', expectOk: false, expect: ['scenes[1].steps[0].item: must be at most 24 characters (got 59)']},

  {file: 'graph-valid.json', expectOk: true},
  {file: 'graph-bad-edge.json', expectOk: false,
   expect: ['scenes[1].edges[1]: to id "ghost" does not name a node']},
  {file: 'graph-dup-id.json', expectOk: false,
   expect: ['scenes[1]: duplicate node id "server"']},
  {file: 'graph-bad-focus.json', expectOk: false,
   expect: ['scenes[1].steps[1].focus[2]: unknown edge "start->ghost2"',
            'scenes[1].steps[2].focus[2]: unknown node id "nope"']},
  {file: 'graph-never-focused.json', expectOk: false,
   expect: ['scenes[1]: node "done" is never focused']},
  {file: 'graph-too-wide.json', expectOk: false,
   expect: ['below the 28px minimum']},
  {file: 'code-valid.json', expectOk: true},
  {file: 'code-line-range.json', expectOk: false, expect: ['line 99 does not exist']},
  {file: 'code-too-many-lines.json', expectOk: false, expect: ['at most 12 fit on screen']},
  {file: 'code-uncovered-line.json', expectOk: false, expect: ['line 8 is never focused']},
  {file: 'code-long-line.json', expectOk: false, expect: ['at most 60 fit on screen']},
  {file: 'trace-valid.json', expectOk: true},
  {file: 'trace-bad-path.json', expectOk: false, expect: ['outside this project']},
  {file: 'trace-nonmonotone.json', expectOk: false, expect: ['does not increase']},
  {file: 'trace-exceeds.json', expectOk: false, expect: ['exceeds the 2 states']},
  {file: 'trace-stale.json', expectOk: false, expect: ['STALE']},
  {file: 'table-valid.json', expectOk: true},
  {file: 'table-ragged-row.json', expectOk: false, expect: ['scenes[1].rows[2]: has 2 cells, expected 3']},
  {file: 'table-bad-focus.json', expectOk: false,
   expect: ['scenes[1].steps[1].row: row 5 does not exist (table has 4 rows)',
            'scenes[1].steps[2].col: column 4 does not exist (table has 3 columns)']},
  {file: 'table-no-focus.json', expectOk: false, expect: ['scenes[1].steps[0]: set row, col or both']},
  {file: 'table-cell-too-long.json', expectOk: false, expect: ['scenes[1].rows[0][1]: must be at most 36 characters']},
  {file: 'sequence-valid.json', expectOk: true},
  {file: 'sequence-bad-actor.json', expectOk: false, expect: ['scenes[1].messages[1]: to id "cache" does not name an actor']},
  {file: 'sequence-label-too-long.json', expectOk: false, expect: ['scenes[1].messages[0].label: 30 characters, but at most 19 fit']},
  {file: 'sequence-bad-steps.json', expectOk: false,
   expect: ['scenes[1].steps[1].toMessage: 2 does not increase', 'scenes[1]: the last step must end at message 4']},
  {file: 'timeline-valid.json', expectOk: true},
  {file: 'timeline-too-many.json', expectOk: false, expect: ['scenes[1].steps: must have at most 6 items (got 7)']},
  {file: 'timeline-label-long.json', expectOk: false, expect: ['scenes[1].steps[0].label: must be at most 36 characters (got 39)']},
  {file: 'timeline-missing-when.json', expectOk: false, expect: ['scenes[1].steps[1].when: required field missing']},
  {file: 'timeline-narration-both.json', expectOk: false, expect: ['scenes[1]: provide either narration or steps, not both']},
];

function runValidator(file: string): {code: number; output: string} {
  try {
    const out = execFileSync('node', ['--no-warnings', 'pipeline/validate.ts', `pipeline/fixtures/${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {code: 0, output: out.trim()};
  } catch (e) {
    const err = e as {status?: number; stdout?: string; stderr?: string};
    return {code: err.status ?? 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim()};
  }
}

let failures = 0;
for (const c of cases) {
  const {code, output} = runValidator(c.file);
  const exitedAsExpected = c.expectOk ? code === 0 : code === 1;
  const missing = (c.expect ?? []).filter((s) => !output.includes(s));
  const pass = exitedAsExpected && missing.length === 0;
  if (!pass) failures++;
  console.log(`\n=== ${c.file} — ${pass ? 'PASS' : 'FAIL'} (exit ${code}) ===`);
  console.log(output || '(no output)');
  if (!exitedAsExpected) console.log(`>> expected exit ${c.expectOk ? 0 : 1}, got ${code}`);
  for (const m of missing) console.log(`>> expected message containing: ${m}`);
}

console.log(`\n${cases.length - failures}/${cases.length} fixture cases passed`);
process.exit(failures ? 1 : 0);
