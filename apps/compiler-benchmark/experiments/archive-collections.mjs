import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { lab, workspace } from './prepare.mjs';
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const collections = await read('collections/results.json');
const initialScreen = await read('collections-initial/results.json');
const initialConfirmation = await read(
  'collections-initial-confirmed/results.json',
);
const accessibility = await read('collections-accessibility/results.json');
const forcedAccessibility = await read(
  'collections-accessibility-forced/results.json',
);
const parser = await read('parser/results.json');
const validation = await read('validation/collections.json');
assert.equal(collections.raw.length, 49);
assert.equal(collections.trace.length, 21);
assert.equal(initialScreen.raw.length, 21);
assert.equal(initialConfirmation.raw.length, 28);
assert.equal(initialConfirmation.trace.length, 12);
assert(parser.contracts.every((contract) => contract.passed));
assert.equal(parser.raw.length, 7);
assert(validation.checks.every((check) => check.exitCode === 0));
for (const data of [
  collections,
  initialScreen,
  initialConfirmation,
  accessibility,
  forcedAccessibility,
]) {
  assert.equal(hash(data.fixture), data.sourceSha256);
  assert.equal(hash(data.css), data.cssSha256);
}
// Preserve the actual runners used before later diagnostic refinements.
const runners = {};
for (const [name, path] of Object.entries({
  collections: 'collections/runner-phase1.mjs',
  initialScreen: 'collections-initial/runner-phase2.mjs',
  initialConfirmation: 'collections-initial-confirmed/runner-phase3.mjs',
})) {
  const source = await readFile(join(lab, path), 'utf8');
  runners[name] = { sha256: hash(source), source };
}
const methods = {};
for (const file of [
  'run-collections.mjs',
  'collections.fixture.ts',
  'collections.css',
  'collections-initial-scheduler.ts',
  'collections-initial-scheduler.test.mjs',
  'run-parser.mjs',
  'validate-collections.mjs',
  'archive-collections.mjs',
]) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  methods[file] = { sha256: hash(source), source };
}
const manifestPath = join(
  workspace,
  'docs/benchmarks/2026-11-17-performance-campaign.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const evidence = '2026-11-17-collections-and-parser-summary.json';
const updates = {
  'css-content-visibility': {
    decision: 'restricted; no automatic activation',
    coverage:
      'Fixed-height blocks retain all components and save layout work. A missing offscreen button in the CDP AX tree is reproduced with complete accessibility enabled; focus activates it. Keyboard, window.find, print override and dimensions are tested.',
  },
  'css-fixed-table': {
    decision: 'restricted application layout policy',
    coverage:
      'Known width and explicit columns reduce layout time on this table. A long-label control proves truncation versus growth; no compiler rewrite is enabled.',
  },
  virtualization: {
    decision: 'restricted benchmark prototype; no public component added',
    coverage:
      'Window plus overscan and pinned focus, with Craft row buttons and global indexes. Offscreen DOM/AX/search/print scope differs; native Tab across a pinned gap skips unmounted rows.',
  },
  'progressive-scheduling': {
    decision:
      'measured trade-off; initial-only policy remains a benchmark prototype',
    coverage:
      'Default scheduling, provided FrameForScheduler, and initial-only wrapping of the same FrameForScheduler are interleaved. First rows, full completion, updates, reorder, late append, cancellation and source changes are tested. Total CPU and later long tasks remain visible.',
  },
  'oxc-build': {
    decision: 'not retained for the current JavaScript AST pipeline',
    coverage:
      'Thirteen real modules, fully materialized ASTs, seventeen syntax/output contracts, seven fresh processes, compiler stage timings and a measured zero-parser counterfactual. OXC AST incompatibility is tested; no backend migration is claimed.',
  },
};
for (const [id, update] of Object.entries(updates))
  Object.assign(
    manifest.items.find((item) => item.id === id),
    { status: 'measured', evidence, ...update },
  );
manifest.updatedAt = new Date().toISOString();
manifest.progress = {
  newItemsMeasured: manifest.items.filter((item) => item.status === 'measured')
    .length,
  partialItems: manifest.items.filter((item) => item.status === 'partial')
    .length,
  historicalItemsAudited: manifest.items.filter(
    (item) => item.status === 'audited historical measurements',
  ).length,
  complete: false,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  sourceCommit: 'cd3d220e9',
  status: 'incomplete campaign',
  manifest,
  collections,
  initialScreen,
  initialConfirmation,
  accessibility,
  forcedAccessibility,
  parser,
  validation,
  runners,
  methods,
  limitations: [
    'All rendering uses existing Craft components. No imperative rendering API, virtual-list component or scheduler policy is enabled in production libraries.',
    'Rows have fixed 32px height; grouped CSS containers contain exactly fifty rows. This is not a variable-height virtualizer.',
    'Paint opportunities are measured after animation frames relative to bootstrap start, not actual presentation timestamps or navigation LCP.',
    'Layout and style timings are CDP metrics; paint event durations come from separate tracing navigations. The trace data is not mixed into timing samples.',
    'Readiness counts rows using a MutationObserver. Its measured CPU cost is included and reported; it is higher for progressive scheduling.',
    'The initial scheduler screen also changed the scheduler implementation. Only the confirmation with a provided FrameForScheduler isolates the phase policy.',
    'The initial-only policy makes later work synchronous again; late append and full reorder expose its blocking cost.',
    'CDP AX observations are for the tested Chromium build and are not a complete assistive-technology certification.',
    'Parser AST representations differ. The zero-parser control is a hypothetical ceiling with fresh TypeScript AST creation outside its timer, not an OXC compiler implementation.',
  ],
};
await writeFile(
  join(
    workspace,
    'docs/benchmarks/2026-11-17-collections-and-parser-summary.json',
  ),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  'Archived five additional measured avenues; campaign remains incomplete.',
);
