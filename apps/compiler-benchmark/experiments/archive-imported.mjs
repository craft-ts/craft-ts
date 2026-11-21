import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lab, workspace } from './prepare.mjs';
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const lean = await read('imported-micro-final/results.json');
const standard = await read('imported-default-mode/results.json');
const page = await read('imported-page/report.json');
const provenance = await read('imported-page/provenance.json');
const compilerTests = await read('tests/imported-integrated.json');
const componentTests = await read('tests/imported-component.json');
const watch = await read('tests/imported-watch-integrated.json');
const generated = await read('tests/imported-output.json');
const lint = await read('tests/imported-component-lint.json');
assert.equal(lean.raw.length, 42);
assert.equal(standard.raw.length, 20);
assert(lean.contracts.every((c) => c.passed));
assert(standard.contracts.every((c) => c.passed));
assert(compilerTests.success && compilerTests.numPassedTests === 77);
assert(componentTests.success && componentTests.numPassedTests === 609);
assert(watch.passed && watch.cachedDependencyMetadata);
assert(generated.passed && generated.results.length === 14);
assert(lint.unchangedIssues);
const methods = {};
for (const name of [
  'imported-lists.mjs',
  'import-graph.fixture.ts',
  'imported-lists.contracts.ts',
  'watch-imports.mjs',
  'run-micro.mjs',
  'run-page.mjs',
  'verify-integrated.mjs',
  'archive-imported.mjs',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { sha256: hash(source), source };
}
const microRunner = await readFile(join(lab, 'micro.mjs'), 'utf8');
const importedFixture = await readFile(
  join(lab, 'imported-fixture/rows.ts'),
  'utf8',
);
const candidate = await read('roots/imported-lists/candidate.json');
const integrated = {};
for (const name of [
  'libs/compiler/src/compiler.ts',
  'libs/compiler/src/vite.ts',
  'libs/compiler/src/import-graph.ts',
  'libs/component/src/lib/render/compiled-template.ts',
])
  integrated[name] = hash(await readFile(join(workspace, name)));
const manifestPath = join(
  workspace,
  'docs/benchmarks/2026-11-17-performance-campaign.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
Object.assign(
  manifest.items.find((i) => i.id === 'imported-list-specialization'),
  {
    status: 'measured',
    decision: 'retained behind imports: true, default false',
    evidence: '2026-11-17-imported-lists-summary.json',
    coverage:
      'Direct named imports of compiled const exports in a proven acyclic loaded application graph. Import aliases, lexical scope, cycle refusal, opt-in, SSR exclusion and real Vite watch rebuilds are tested. Imported 5000-row fixtures improve with lean; the realistic page does not.',
  },
);
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (i) => i.status === 'measured',
).length;
manifest.protocol.isolation =
  'Candidates are materialized from the baseline in tmp/performance-campaign. Retained local/imported compiler passes are integrated separately; experimental runtime strategies remain isolated.';
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  integratedCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim(),
  baseline: '89f1e46de',
  compilerFoundation: 'cd3d220e9',
  decision: 'retained opt-in, campaign incomplete',
  lean,
  standard,
  page,
  provenance,
  candidate,
  integrated,
  validation: { compilerTests, componentTests, watch, generated, lint },
  microRunner: { sha256: hash(microRunner), source: microRunner },
  importedFixture: { sha256: hash(importedFixture), source: importedFixture },
  methods,
  limitations: [
    'Lean and standard are separate cohorts. Absolute timings cannot attribute the difference between lean and standard modes.',
    'Seven interleaved navigations per lean case/variant, five per standard case/variant; five measured action loops after warm-up. Page: seven navigations, three action loops, scale 2.',
    'The standard cohort has wider mount dispersion, including a slow first navigation; its modest median improvement is not a universal speedup claim.',
    'Single-row updates in lean cost 0.1–0.2ms more here; indexed standard reverse also costs more. All raw actions are retained.',
    'Page DOM equivalence checks 47 interaction snapshots. No page mount or retained heap improvement is claimed.',
    'Build times are single sequential cache-sensitive observations. They do not establish build throughput.',
    'Imported graph gained an import-attribute refusal and a formatting/lint refinement after the main timings. The fixture has no attributes; generated code equality against the measured candidate is checked on fourteen sources.',
    'Component helper lint has three pre-existing errors and three warnings, unchanged versus HEAD before this feature. Compiler lint has no errors and five pre-existing warnings.',
    'Library then spec TypeScript checks passed in that order. This archive preserves unit/watch/generated-output results, not a captured shell transcript of those checks.',
  ],
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-17-imported-lists-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  'Archived imported-list proof, measurements and validation; campaign remains incomplete.',
);
