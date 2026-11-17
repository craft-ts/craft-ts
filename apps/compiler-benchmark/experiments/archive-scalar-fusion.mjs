import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { lab, workspace } from './prepare.mjs';
const read = async (file) =>
  JSON.parse(await readFile(join(lab, file), 'utf8'));
const hash = (source) => createHash('sha256').update(source).digest('hex');
const tests = {
  compiler: await read('tests/scalar-fusion-compiler.json'),
  component: await read('tests/scalar-fusion-component.json'),
  checks: await read('tests/scalar-fusion-validation.json'),
  adversarial: await read('tests/scalar-fusion-adversarial.json'),
};
assert(
  tests.compiler.success && [94, 95].includes(tests.compiler.numPassedTests),
);
assert(tests.adversarial.success && tests.adversarial.numPassedTests === 7);
assert(tests.component.success && tests.component.numPassedTests === 609);
assert(tests.checks.every((check) => check.exitCode === 0));
const micro = await read('scalar-fusion-micro/results.json'),
  wide = await read('scalar-fusion-wide/results.json'),
  runtime = await read('scalar-fusion-runtime/results.json');
assert.equal(micro.raw.length, 64);
assert.equal(wide.raw.length, 16);
assert.equal(runtime.raw.length, 32);
assert(
  [...micro.contracts, ...wide.contracts, ...runtime.contracts].every(
    (c) => c.passed,
  ),
);
const page = {
  report: await read('scalar-fusion-page/report.json'),
  provenance: await read('scalar-fusion-page/provenance.json'),
};
assert.equal(page.report.equivalence['2'].steps, 47);
assert(
  Object.values(page.report.cases[0].samples).every(
    (samples) => samples.length === 8,
  ),
);
for (const build of Object.values(page.provenance.builds))
  delete build.candidate;
const files = [
  'libs/compiler/src/compiler.ts',
  'libs/compiler/src/vite.ts',
  'libs/compiler/src/import-graph.ts',
  'libs/component/src/lib/render/compiled-template.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/core/src/lib/craft-service.ts',
];
const foundation = {
  commit: '70a51b49e',
  patches: '2026-11-17-compiler-ablations-summary.json#common',
  sha256: {},
};
const changes = [];
for (const file of files) {
  const before = join(lab, 'roots/scalar-fusion-reference', file),
    after = join(lab, 'roots/scalar-fusion-gated', file);
  const source = await readFile(before);
  assert.equal(
    hash(source),
    hash(
      execFileSync('git', ['show', foundation.commit + ':' + file], {
        cwd: workspace,
      }),
    ),
  );
  foundation.sha256[file] = hash(source);
  const diff = spawnSync('git', ['diff', '--no-index', '--', before, after], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  assert([0, 1].includes(diff.status));
  if (diff.status)
    changes.push({
      file,
      sha256: hash(await readFile(after)),
      patch: diff.stdout
        .replaceAll(
          join(lab, 'roots/scalar-fusion-reference') + '/',
          'reference/',
        )
        .replaceAll(
          join(lab, 'roots/scalar-fusion-gated') + '/',
          'scalar-fusion-gated/',
        ),
    });
}
const methods = {},
  runners = {},
  artifacts = {};
for (const name of [
  'scalar-fusion.mjs',
  'scalar-fusion.contracts.ts',
  'validate-scalar-fusion.mjs',
  'archive-scalar-fusion.mjs',
  'run-micro.mjs',
  'run-page.mjs',
]) {
  const source = await readFile(new URL(name, import.meta.url), 'utf8');
  methods[name] = { sha256: hash(source), source };
}
for (const name of [
  'scalar-fusion-micro',
  'scalar-fusion-wide',
  'scalar-fusion-runtime',
]) {
  const source = await readFile(join(lab, name, 'runner.mjs'), 'utf8');
  runners[name] = { sha256: hash(source), source };
  artifacts[name] = {};
  for (const id of ['scalar-fusion-reference', 'scalar-fusion-gated']) {
    const dir = join(lab, name, 'dist', id, 'assets');
    artifacts[name][id] = await Promise.all(
      (await readdir(dir))
        .filter((file) => file.endsWith('.js'))
        .map(async (file) => ({
          file,
          sha256: hash(await readFile(join(dir, file))),
        })),
    );
  }
}
const { compileModule } = await import(
  pathToFileURL(
    join(lab, 'roots/scalar-fusion-gated/dist/libs/compiler/src/compiler.js'),
  )
);
const coverage = [];
for (const file of [
  'apps/compiler-benchmark/main.ts',
  ...(await readdir(join(workspace, 'apps/framework-benchmark/src/craft-page')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => 'apps/framework-benchmark/src/craft-page/' + file),
]) {
  const source = await readFile(join(workspace, file), 'utf8'),
    result = compileModule(source, file, { lean: true });
  const ast = ts.createSourceFile(
      file,
      result.code,
      ts.ScriptTarget.Latest,
      true,
    ),
    eligible = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text.startsWith('__craft_compiled_') &&
      node.arguments.length === 2 &&
      ts.isCallExpression(node.arguments[0]) &&
      ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      if (
        node.arguments[1].properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            property.name.getText(ast) === 'scalarFusion' &&
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
    generatedSha256: hash(result.code),
    potentiallyEligibleDefinitions: eligible,
  });
}
const screen = {
  provenance: await read('scalar-fusion-screen/provenance.json'),
  micro: await read('scalar-fusion-micro-screen/results.json'),
  wide: await read('scalar-fusion-wide-screen/results.json'),
  runtime: await read('scalar-fusion-runtime-screen/results.json'),
  page: {
    report: await read('scalar-fusion-page-screen/report.json'),
    provenance: await read('scalar-fusion-page-screen/provenance.json'),
  },
  runners: {},
  artifacts: {},
};
for (const build of Object.values(screen.page.provenance.builds))
  delete build.candidate;
for (const name of ['micro', 'wide', 'runtime']) {
  const source = await readFile(
    join(lab, 'scalar-fusion-' + name + '-screen/runner.mjs'),
    'utf8',
  );
  screen.runners[name] = { sha256: hash(source), source };
  screen.artifacts[name] = {};
  for (const id of ['scalar-fusion-reference', 'scalar-fusion']) {
    const dir = join(
      lab,
      'scalar-fusion-' + name + '-screen/dist',
      id,
      'assets',
    );
    screen.artifacts[name][id] = await Promise.all(
      (await readdir(dir))
        .filter((file) => file.endsWith('.js'))
        .map(async (file) => ({
          file,
          sha256: hash(await readFile(join(dir, file))),
        })),
    );
  }
}
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
const pairs = (result) =>
  result.raw
    .filter((row) => row.label === 'scalar-fusion-reference')
    .map((before) => {
      const after = result.raw.find(
        (row) =>
          row.label === 'scalar-fusion-gated' &&
          row.kind === before.kind &&
          row.count === before.count &&
          row.run === before.run,
      );
      assert(after);
      return {
        case: before.kind,
        count: before.count,
        run: before.run,
        mountDeltaMs: after.mount - before.mount,
        heapDeltaMiB: after.heapMiB - before.heapMiB,
        actionDeltasMs: Object.fromEntries(
          Object.keys(before.actions).map((action) => [
            action,
            after.actions[action] - before.actions[action],
          ]),
        ),
      };
    });
const paired = {};
for (const [name, data] of Object.entries({ micro, wide, runtime })) {
  const raw = pairs(data);
  paired[name] = {
    raw,
    summary: [...new Set(raw.map((row) => row.case))].map((kind) => {
      const rows = raw.filter((row) => row.case === kind);
      return {
        case: kind,
        mountDeltaMs: median(rows.map((row) => row.mountDeltaMs)),
        heapDeltaMiB: median(rows.map((row) => row.heapDeltaMiB)),
        mountFasterPairs: rows.filter((row) => row.mountDeltaMs < 0).length,
        pairs: rows.length,
      };
    }),
  };
}
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  foundation,
  decision:
    'non-equivalent ceiling: reject the current prototype; input-reader replacement changes callback granularity and ordinary cases gain no established benefit',
  navigationCounts: { initialScreen: 128, finalGated: 128 },
  micro,
  wide,
  runtime,
  page,
  paired,
  initialScreen: screen,
  coverage,
  changes,
  methods,
  runners,
  artifacts,
  tests,
  fixtureOptions: {
    micro: {
      rows: 5000,
      cases: ['rows', 'indexed', 'nested', 'fields'],
      runs: 8,
      loops: 5,
    },
    wide: {
      rows: 1000,
      indexCells: 16,
      directReadsPerCell: 2,
      runs: 8,
      loops: 5,
      CAMPAIGN_FUSION_FIXTURE: true,
    },
    runtime: {
      rows: 5000,
      cases: ['rows', 'indexed'],
      runs: 8,
      loops: 5,
      compiler: false,
    },
    page: { scale: 2, runs: 8, loops: 3 },
  },
  limitations: [
    'A final adversarial contract demonstrates non-equivalence: a later binding replaces the input reader after a private numeric-index group is created. On a new dependency update, the fused group calls the application reader four times instead of two. Positive ownership at registration does not prove stable binding dependencies.',
    'The seven targeted contracts include this expected counterexample; a passing test suite does not make the prototype equivalent. The complete 94-test compiler suite ran before this test-only addition; the seven targeted contracts and spec typecheck ran afterward.',
    'Only consecutive exact reads of one input, to text/data/aria targets, can share an effect. Setup, events and holes disable the plan. Projection, arithmetic, aliases, extra calls and try/finally stay ordinary.',
    'A private positive WeakSet accepts numeric index readers only from proven lean list factories whose child plan can fuse, and primitive constants only while normalizing inputs for such a plan. Unknown application functions are not probed or coalesced.',
    'Each original reader invocation and DOM write remains in source order. The prototype shares the effect owner; it does not replace all reader calls with one cached result.',
    'Compiler eligibility counts are potential coverage, not proof that a particular mounted input has a recognized runtime reader.',
    'The wide fixture repeats the same numeric index in sixteen cells. It is deliberately favorable and does not represent sixteen independent changing fields.',
    'An initial unconditional prototype is archived separately: it adds about 0.25MiB to 5000 rows even without the plugin. The final prototype gates both registration and the refactored binding loop; the ordinary and no-plugin cohorts measure its remaining overhead.',
    'Production remains at the previous implementation; this prototype introduces no public option or imperative API.',
    'Minified production builds, fresh contexts, seeded interleaving and adjacent balanced blocks for micro/wide/runtime. No concurrent test/build process during timings. Absolute values across separate cohorts are not causal differences.',
    'Mount/action timing measures synchronous JS/DOM, not LCP/INP. Retained JS heap after forced GC excludes native DOM memory; build timings are order/cache sensitive.',
  ],
};
const manifestPath = join(
    workspace,
    'docs/benchmarks/2026-11-17-performance-campaign.json',
  ),
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
Object.assign(
  manifest.items.find((item) => item.id === 'scalar-binding-fusion'),
  {
    status: 'measured',
    decision: result.decision,
    evidence: '2026-11-17-scalar-fusion-summary.json',
    coverage:
      'Consecutive exact reads of renderer-owned numeric indexes or normalized primitive constants. Unknown-reader side effects, DOM observation order, Proxy probes, primitive rebinds, identity and destruction are tested. A reader-replacement counterexample rejects general activation. Ordinary rows, a favorable repeated-index fixture, the realistic page and no-plugin controls are measured.',
  },
);
manifest.updatedAt = new Date().toISOString();
manifest.progress.newItemsMeasured = manifest.items.filter(
  (item) => item.status === 'measured',
).length;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(
  join(workspace, 'docs/benchmarks/2026-11-17-scalar-fusion-summary.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log('Archived scalar fusion; campaign remains incomplete.');
