#!/usr/bin/env node
/**
 * Type-cost budget for component composition (issue #40).
 *
 * A component type used to carry the whole tree its template rendered, so a
 * chain of 7–8 nested components hit TS2589 and the DI proof degraded. This
 * script keeps that from coming back: it generates compositions on the fly,
 * type-checks each one with `tsc --extendedDiagnostics`, and fails when
 *
 * - a fixture does not compile (TS2589, TS2321, TS7056, or a DI proof that no
 *   longer matches — every fixture asserts its proof with a typed constant);
 * - the cost of one more level of nesting exceeds its budget. The slope is
 *   measured between two depths, so it is independent of the fixed cost of
 *   loading the libraries and of the machine;
 * - the total instantiation count of a fixture exceeds its budget.
 *
 * Usage:
 *   node tools/check-type-budget.mjs            # check every scenario
 *   node tools/check-type-budget.mjs --json     # machine-readable report
 *   node tools/check-type-budget.mjs --only sealed-union
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workDir = join(repoRoot, 'tmp', 'type-budget');
const tscPath = join(repoRoot, 'node_modules', '.bin', 'tsc');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;

// -----------------------------------------------------------------------------
// Fixture generation
// -----------------------------------------------------------------------------

const PREAMBLE = `import { craftComputed, craftService, state, type ComponentDepsOf, type RouteCheckedDI } from '@craft-ts/core';
import { craftComponent, div, forNode, p, section, sealComponent, type Input } from '../../libs/component/src/index';

const { Counter } = craftService({ name: 'Counter', providedIn: 'toProvide' }, function* () {
  const count = yield* state('count', 0);
  yield* craftComputed('label', function* () {
    return \`\${yield* count()}\`;
  });
});
`;

const MISSING_COUNTER = `['The Counter service is not provided in this component']`;

/** A chain of `depth` components; the leaf yields `Counter`. */
function chain(depth, { sealed, prefix = 'C' }) {
  const wrap = (expression) => (sealed ? `sealComponent(${expression})` : expression);
  const lines = [
    `const ${prefix}${depth} = ${wrap(
      `craftComponent('${prefix}${depth}', {}, function* () { const counter = yield* Counter(); return p(counter.label); })`,
    )};`,
  ];
  for (let level = depth - 1; level >= 1; level -= 1) {
    lines.push(
      `const ${prefix}${level} = ${wrap(
        `craftComponent('${prefix}${level}', {}, () => div([p('title'), section([${prefix}${level + 1}()])]))`,
      )};`,
    );
  }
  return lines.join('\n');
}

/** Typed constants that only compile while the DI proof is exact. */
function proof(component) {
  return `
export const missing_${component}: RouteCheckedDI<ComponentDepsOf<typeof ${component}>, 'Other'> = ${MISSING_COUNTER};
export const proven_${component}: RouteCheckedDI<ComponentDepsOf<typeof ${component}>, 'Counter'> = true;
`;
}

const scenarios = [
  {
    name: 'chain',
    description: 'plain nested components (the reference case of issue #40)',
    depths: [8, 16],
    perLevelBudget: 15_000,
    source: (depth) => `${chain(depth, { sealed: false })}\n${proof('C1')}`,
  },
  {
    name: 'sealed-chain',
    description: 'sealComponent at every level, thirty-two levels down',
    depths: [16, 32],
    perLevelBudget: 15_000,
    source: (depth) => `${chain(depth, { sealed: true })}\n${proof('C1')}`,
  },
  {
    name: 'sealed-union',
    description: 'a node choosing between two deep sealed components',
    depths: [32],
    totalBudget: 3_400_000,
    source: (depth) => `${chain(depth, { sealed: true })}
declare const flag: boolean;
const Choice = craftComponent('Choice', {}, () => div([flag ? C1() : C2(), flag ? C3() : C${Math.floor(depth / 2)}()]));
${proof('Choice')}`,
  },
  {
    name: 'sealed-for-rows',
    description: 'keyed forNode rows mounting a sealed component sixteen levels deep',
    depths: [16],
    totalBudget: 3_250_000,
    source: (depth) => `${chain(depth, { sealed: true })}
const Row = sealComponent(craftComponent('Row', {}, (inputs: { label: Input<string> }) => div([p(inputs.label), section([C1()])])));
const items = () => ['a', 'b'];
const List = craftComponent('List', {}, () => div([forNode(items, { track: (item) => item }, (item) => Row({ label: item }))]));
${proof('List')}`,
  },
  {
    name: 'sealed-declaration',
    description: 'emitting the declaration of an exported sealed component (no TS7056)',
    depths: [16],
    emitDeclarations: true,
    totalBudget: 3_250_000,
    source: (depth) => `${chain(depth, { sealed: true, prefix: 'D' })}
export const Exported = sealComponent(craftComponent('Exported', {}, () => div([D1()])));
${proof('Exported')}`,
  },
];

// -----------------------------------------------------------------------------
// Running
// -----------------------------------------------------------------------------

function compile(name, depth, source, emitDeclarations) {
  const fixture = join(workDir, `${name}-${depth}.ts`);
  const config = join(workDir, `${name}-${depth}.tsconfig.json`);
  writeFileSync(fixture, `${PREAMBLE}\n${source}\n`);
  const compilerOptions = emitDeclarations
    ? {
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        allowImportingTsExtensions: false,
        outDir: join(workDir, 'out'),
        rootDir: repoRoot,
      }
    : { noEmit: true };
  writeFileSync(
    config,
    JSON.stringify(
      {
        extends: join(repoRoot, 'libs/component/tsconfig.spec.json'),
        compilerOptions: { ...compilerOptions, composite: false, incremental: false },
        files: [fixture],
        include: [],
      },
      null,
      2,
    ),
  );
  let output = '';
  try {
    output = execFileSync(
      tscPath,
      ['-p', config, '--extendedDiagnostics', '--pretty', 'false'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const errors = output
    .split('\n')
    .filter((line) => /error TS\d+/.test(line))
    // Only the fixture's own diagnostics: the libraries are checked elsewhere.
    .filter((line) => line.includes(`${name}-${depth}.ts`));
  const instantiations = Number(
    /Instantiations:\s+(\d+)/.exec(output)?.[1] ?? Number.NaN,
  );
  return { depth, errors, instantiations };
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const report = [];
let failed = false;
for (const scenario of scenarios) {
  if (only && scenario.name !== only) continue;
  const runs = scenario.depths.map((depth) =>
    compile(scenario.name, depth, scenario.source(depth), scenario.emitDeclarations),
  );
  const failures = [];
  for (const run of runs) {
    if (run.errors.length > 0) {
      failures.push(`depth ${run.depth}: ${run.errors.length} error(s)\n    ${run.errors.slice(0, 5).join('\n    ')}`);
    }
    if (Number.isNaN(run.instantiations)) {
      failures.push(`depth ${run.depth}: no instantiation count reported`);
    }
    if (scenario.totalBudget && run.instantiations > scenario.totalBudget) {
      failures.push(
        `depth ${run.depth}: ${run.instantiations} instantiations, budget ${scenario.totalBudget}`,
      );
    }
  }
  let perLevel;
  if (scenario.perLevelBudget && runs.length === 2) {
    const [low, high] = runs;
    perLevel = Math.round(
      (high.instantiations - low.instantiations) / (high.depth - low.depth),
    );
    if (perLevel > scenario.perLevelBudget) {
      failures.push(
        `${perLevel} instantiations per nesting level, budget ${scenario.perLevelBudget}`,
      );
    }
  }
  if (failures.length > 0) failed = true;
  report.push({
    name: scenario.name,
    description: scenario.description,
    runs: runs.map(({ depth, instantiations, errors }) => ({
      depth,
      instantiations,
      errors: errors.length,
    })),
    perLevel,
    failures,
  });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const entry of report) {
    const status = entry.failures.length === 0 ? 'ok  ' : 'FAIL';
    const runs = entry.runs
      .map((run) => `depth ${run.depth}: ${run.instantiations} inst`)
      .join(', ');
    const slope = entry.perLevel === undefined ? '' : `, ${entry.perLevel}/level`;
    console.log(`${status} ${entry.name} — ${entry.description}\n     ${runs}${slope}`);
    for (const failure of entry.failures) console.log(`     ✗ ${failure}`);
  }
}
process.exit(failed ? 1 : 0);
