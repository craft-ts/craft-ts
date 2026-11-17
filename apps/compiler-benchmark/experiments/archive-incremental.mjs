import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { lab, workspace } from './prepare.mjs';
const read = async (path) =>
  JSON.parse(await readFile(join(lab, path), 'utf8'));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const compilerTests = await read('tests/incremental-compiler-complete.json');
const contracts = await read('tests/incremental-contracts-verified.json');
const componentTests = await read('tests/incremental-component-verified.json');
assert(compilerTests.success && compilerTests.numPassedTests === 82);
assert(contracts.success && contracts.numPassedTests === 5);
assert(componentTests.success && componentTests.numPassedTests === 609);
const micro = await read('incremental-micro/results.json'),
  wide = await read('incremental-wide-index/results.json');
assert.equal(micro.raw.length, 64);
assert.equal(wide.raw.length, 16);
assert(
  [...micro.contracts, ...wide.contracts].every((contract) => contract.passed),
);
const page = {
  report: await read('incremental-page/report.json'),
  provenance: await read('incremental-page/provenance.json'),
};
assert(page.report.equivalence['2']);
const candidates = {};
for (const name of ['incremental-rebind-reference', 'incremental-rebind']) {
  const candidate = await read('roots/' + name + '/candidate.json');
  candidates[name] = {
    id: candidate.id,
    baseCommit: candidate.baseCommit,
    foundation: 'b6cc4a594',
    changes: [],
  };
  for (const change of candidate.changes) {
    const diff = spawnSync(
      'git',
      [
        'diff',
        '--no-index',
        '--',
        join(lab, 'roots/baseline', change.file),
        join(lab, 'roots', name, change.file),
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    assert([0, 1].includes(diff.status));
    candidates[name].changes.push({
      file: change.file,
      beforeSha256: change.beforeSha256,
      afterSha256: change.afterSha256,
      patch: diff.stdout,
    });
  }
}
const methods = {};
for (const name of [
  'incremental-rebind.mjs',
  'incremental-dependencies.ts',
  'incremental-rebind.contracts.ts',
  'run-micro.mjs',
  'run-page.mjs',
  'archive-incremental.mjs',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { sha256: hash(source), source };
}
const runners = {},
  artifacts = {};
for (const name of ['incremental-micro', 'incremental-wide-index']) {
  const source = await readFile(join(lab, name, 'runner.mjs'), 'utf8');
  runners[name] = { sha256: hash(source), source };
  artifacts[name] = {};
  for (const label of ['incremental-rebind-reference', 'incremental-rebind']) {
    const directory = join(lab, name, 'dist', label, 'assets');
    artifacts[name][label] = await Promise.all(
      (await readdir(directory))
        .filter((name) => name.endsWith('.js'))
        .map(async (name) => ({
          file: name,
          sha256: hash(await readFile(join(directory, name))),
        })),
    );
  }
}
const { compileModule } = await import(
  pathToFileURL(
    join(lab, 'roots/incremental-rebind/dist/libs/compiler/src/compiler.js'),
  )
);
const coverage = [];
for (const file of [
  'apps/compiler-benchmark/main.ts',
  ...(await readdir(join(workspace, 'apps/framework-benchmark/src/craft-page')))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => 'apps/framework-benchmark/src/craft-page/' + name),
]) {
  const source = await readFile(join(workspace, file), 'utf8'),
    compiled = compileModule(source, file, { lean: true });
  const ast = ts.createSourceFile(
    file,
    compiled.code,
    ts.ScriptTarget.Latest,
    true,
  );
  const eligible = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text.startsWith('__craft_compiled_') &&
      node.arguments.length === 2 &&
      ts.isCallExpression(node.arguments[0]) &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      const plan = node.arguments[1];
      if (
        plan.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            property.name.getText(ast) === 'incremental' &&
            property.initializer.kind === ts.SyntaxKind.TrueKeyword,
        )
      )
        eligible.push(node.arguments[0].arguments[0].getText(ast));
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  coverage.push({
    file,
    sourceSha256: hash(source),
    generatedSha256: hash(compiled.code),
    eligible,
  });
}
const manifestPath = join(
  workspace,
  'docs/benchmarks/2026-11-17-performance-campaign.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
Object.assign(
  manifest.items.find((item) => item.id === 'incremental-rebind'),
  {
    status: 'measured',
    decision:
      'restricted prototype, not enabled: ordinary row update gain not established and retained heap increases',
    evidence: '2026-11-17-incremental-rebind-summary.json',
    coverage:
      'Only proven lean list factories own the input objects. Static dependency analysis, stable primitive index readers, getter refusal, Proxy fallback, DOM observation order and destruction are tested. Standard rows, indexed/nested controls, realistic page and a sixteen-index-cell synthetic control are measured.',
  },
);
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (item) => item.status === 'measured',
).length;
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  foundation: 'b6cc4a594',
  decision: 'restricted prototype, no production runtime change',
  micro,
  wide,
  page,
  coverage,
  candidates,
  methods,
  runners,
  artifacts,
  fixtureOptions: {
    micro: {
      mode: 'lean',
      rows: 5000,
      cases: ['rows', 'indexed', 'nested', 'fields'],
      blocked: true,
      runs: 8,
    },
    wide: {
      mode: 'lean',
      rows: 1000,
      cases: ['indexed'],
      blocked: true,
      runs: 8,
      indexCells: 16,
      CAMPAIGN_WIDE_INDEX: true,
    },
    page: { scale: 2, runs: 8, iterations: 3 },
  },
  validation: {
    compilerTests,
    contracts,
    componentTests,
    typechecks: [
      'Compiler library and spec checks passed.',
      'Component check passed with composite disabled in the isolated source tree.',
    ],
    componentTypecheckLog: await readFile(
      join(lab, 'tests/incremental-typecheck-final.log'),
      'utf8',
    ),
  },
  limitations: [
    'Only input records constructed by proven forNode callbacks are marked as owned. Unknown calls, direct application inputs and Proxies keep full rebinds; no extra enumeration of their raw inputs is introduced.',
    'Records retain a stable internal input-reader object; changed readers are replaced there so retained bindings do not keep old row inputs alive.',
    'Setup, events, holes, arbitrary calls, input aliases, computed keys, try/finally and reflective code disable the partial plan. The mode is lean-only; standard generated bindings have no rebind metadata.',
    'Property projections may call getters, even on numbers. A test reproduces the naive dependency-only failure and verifies that these bindings always rebind. Only stable primitive expressions can be skipped.',
    'Framework row readers are recreated; index readers preserve identity and return the private numeric cell. This is not a general proof that an arbitrary application reader is pure.',
    'Wide control repeats the index in sixteen cells; it is a deliberately favorable synthetic case, not a typical table with sixteen independently changing row fields.',
    'The complete compiler suite passed 82 tests. A test-only replacement of toReversed with a copied reverse was then necessary for the configured TypeScript lib; spec typecheck and all five targeted contracts passed afterward.',
    'A component validation overlapped candidate regeneration and was discarded. The archived component result is the subsequent 609-test run against fixed sources.',
    'No test/build subprocess runs during a timing cohort. Shared desktop load and timing dispersion remain; no universal page mount benefit is claimed.',
    'Mount/action timings measure synchronous JavaScript/DOM work, not LCP or INP. Retained heap is measured after the action sequence and forced GC.',
  ],
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-17-incremental-rebind-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  'Archived incremental rebind experiment; campaign remains incomplete.',
);
