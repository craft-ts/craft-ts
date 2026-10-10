#!/usr/bin/env node
/**
 * Type-level cost harness for `@craft-ts/stream` — wave 0 spike, criterion (4).
 *
 * Method. Hold the craft surface FIXED and vary only the pipeline length. A
 * pipeline of N operators, each adding one distinct service dependency and one
 * distinct typed exception, is built (`pipe` arm) and then CONSUMED
 * (`terminal` arm): its dependency map is computed with
 * `CompleteServiceDependencyMapFromYielded` (the expensive part, paid once, at
 * the terminal — never in an operator signature) and `subscribe` demands an
 * exhaustive handler map for all N exceptions.
 *
 * The instantiation count of a bare `import` is the base; the marginal cost of
 * one operator is read off the slope between N=1 and N=15.
 *
 * Usage:  node tools/stream-typecost/run.mjs [--keep]
 *         --keep leaves the generated cases on disk for inspection.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');
const casesDir = join(here, 'cases');
const keep = process.argv.includes('--keep');

const COUNTS = [0, 1, 5, 10, 15];
const PIPE_ARITY = 14;

/**
 * Budget for criterion (4): what the N=10 terminal adds ON TOP of the bare
 * import, as a share of that base. (Importing core alone is ~1.2M
 * instantiations, so an absolute figure would only measure core.)
 */
const TERMINAL_BUDGET_PCT_AT_10 = 3;

function fixtures() {
  const exceptions = Array.from(
    { length: 15 },
    (_, i) =>
      `export type E${i} = CraftException<{ _tag: 'E${i}'; scope: undefined }, { n: ${i} }>;`,
  ).join('\n');
  return `import type {
  CraftException,
  CraftGenExceptionMarker,
  ServiceDependencies,
  ServiceTrackedDepsRequest,
} from '@craft-ts/core';
import type { CraftStream } from '@craft-ts/stream';

${exceptions}

export type Dep<Name extends string> = ServiceTrackedDepsRequest<{
  [K in Name]: ServiceDependencies<'function', {}>;
}>;

export declare function adding<Name extends string, E>(
  name: Name,
  exception?: E,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y | Dep<Name> | CraftGenExceptionMarker<E>>;

export declare const source: CraftStream<number>;
`;
}

function pipeline(n) {
  if (n === 0) return 'source';
  const operators = Array.from(
    { length: n },
    (_, i) => `adding('D${i}', undefined as unknown as E${i})`,
  );
  const head = operators.slice(0, PIPE_ARITY);
  const tail = operators.slice(PIPE_ARITY);
  let expression = `source.pipe(${head.join(', ')})`;
  for (const operator of tail) expression += `.pipe(${operator})`;
  return expression;
}

function caseSource(n, terminal) {
  const exceptionImports = Array.from({ length: Math.max(n, 1) }, (_, i) => `E${i}`);
  const body = [
    `import { adding, source, type ${exceptionImports.join(', type ')} } from './fixtures';`,
    n === 0
      ? ''
      : `void ({} as [${Array.from({ length: n }, (_, i) => `E${i}`).join(', ')}]);`,
    `export const out = ${pipeline(n)};`,
  ];
  if (terminal) {
    body.unshift(
      `import { subscribe, type StreamYielded } from '@craft-ts/stream';`,
      `import type { CompleteServiceDependencyMapFromYielded, ɵInjector as Injector } from '@craft-ts/core';`,
    );
    const handlers = Array.from(
      { length: n },
      (_, i) => `    E${i}: () => undefined,`,
    ).join('\n');
    body.push(
      `type Services = keyof CompleteServiceDependencyMapFromYielded<StreamYielded<typeof out>>;`,
      `export const services: Services[] = [];`,
      n === 0
        ? `export const handle = subscribe(out, {}, { injector: undefined as unknown as Injector });`
        : `export const handle = subscribe(out, {\n  exception: {\n${handlers}\n  },\n}, { injector: undefined as unknown as Injector });`,
    );
  }
  return `${body.filter(Boolean).join('\n')}\n`;
}

const cases = [];
for (const n of COUNTS) {
  cases.push({ arm: 'pipe', n, name: `pipe-${n}`, source: caseSource(n, false) });
  cases.push({
    arm: 'terminal',
    n,
    name: `terminal-${n}`,
    source: caseSource(n, true),
  });
}

function tsconfigFor(caseName) {
  return {
    compilerOptions: {
      noEmit: true,
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      lib: ['es2022', 'dom'],
      strict: true,
      skipLibCheck: true,
      types: [],
      customConditions: ['@craft-ts/source'],
      paths: {
        '@craft-ts/core': ['../../libs/core/src/index.ts'],
        '@craft-ts/stream': ['../../libs/stream/src/index.ts'],
      },
    },
    include: [`cases/${caseName}.ts`],
  };
}

function measure(caseName) {
  const configPath = join(here, `tsconfig.${caseName}.json`);
  writeFileSync(configPath, `${JSON.stringify(tsconfigFor(caseName), null, 2)}\n`);

  let output;
  let failed = false;
  try {
    output = execFileSync(
      'npx',
      ['tsc', '-p', relative(workspaceRoot, configPath), '--extendedDiagnostics'],
      { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    failed = true;
  }

  if (!keep) rmSync(configPath, { force: true });

  const read = (label) => {
    const match = output.match(new RegExp(`^${label}:\\s+(\\d+)`, 'm'));
    return match ? Number(match[1]) : null;
  };
  const errors = (output.match(/error TS\d+/g) ?? []).length;
  const timeMatch = output.match(/^Check time:\s+([\d.]+)s/m);

  return {
    types: read('Types'),
    instantiations: read('Instantiations'),
    checkSeconds: timeMatch ? Number(timeMatch[1]) : null,
    errors,
    failed,
    output,
  };
}

mkdirSync(casesDir, { recursive: true });
writeFileSync(join(casesDir, 'fixtures.ts'), fixtures());

const results = [];
for (const entry of cases) {
  writeFileSync(join(casesDir, `${entry.name}.ts`), entry.source);
  process.stderr.write(`measuring ${entry.name}…\n`);
  results.push({ ...entry, ...measure(entry.name) });
}

if (!keep) rmSync(casesDir, { recursive: true, force: true });

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);
const byName = Object.fromEntries(results.map((r) => [r.name, r]));

console.log('\n=== Raw measurements ===\n');
console.log(
  `${pad('case', 16)}${padStart('N', 4)}${padStart('types', 10)}${padStart('instantiations', 16)}${padStart('check s', 10)}${padStart('errors', 8)}`,
);
for (const r of results) {
  console.log(
    `${pad(r.name, 16)}${padStart(r.n, 4)}${padStart(r.types ?? '—', 10)}${padStart(r.instantiations ?? '—', 16)}${padStart(r.checkSeconds ?? '—', 10)}${padStart(r.errors, 8)}`,
  );
}

console.log('\n=== Cost of one more operator (slope, N=1 → N=15) ===\n');
for (const arm of ['pipe', 'terminal']) {
  const one = byName[`${arm}-1`]?.instantiations;
  const fifteen = byName[`${arm}-15`]?.instantiations;
  if (one == null || fifteen == null) continue;
  console.log(
    `${pad(arm, 10)} +${((fifteen - one) / 14).toFixed(0)} instantiations per operator ` +
      `(N=1: ${one}, N=15: ${fifteen})`,
  );
}

const base = byName['pipe-0']?.instantiations;
const ten = byName['terminal-10'];
console.log('\n=== Verdict: terminal at N=10 ===\n');
if (ten?.instantiations != null && base != null) {
  const added = ten.instantiations - base;
  const pct = (added / base) * 100;
  const under = pct <= TERMINAL_BUDGET_PCT_AT_10;
  console.log(
    `+${added} instantiations over the bare import (${pct.toFixed(2)}%) — ` +
      `${under ? 'UNDER' : 'OVER'} the +${TERMINAL_BUDGET_PCT_AT_10}% budget` +
      `${ten.checkSeconds != null ? ` (check ${ten.checkSeconds}s)` : ''}`,
  );
  if (!under) process.exitCode = 1;
}

const broken = results.filter((r) => r.failed || r.errors > 0);
if (broken.length > 0) {
  console.log(
    `\n!! ${broken.length} case(s) did not type-check: ${broken.map((r) => r.name).join(', ')}`,
  );
  for (const r of broken.slice(0, 2)) {
    console.log(`\n--- ${r.name} ---\n${r.output.split('\n').slice(0, 8).join('\n')}`);
  }
  process.exitCode = 1;
}
console.log('');
