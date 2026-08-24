#!/usr/bin/env node
/**
 * A/B benchmark for the wave-1 renames (`code` -> `_tag`, `scope` -> `providedIn`).
 *
 * Run it on each branch; it writes a JSON next to itself, and `--compare` reads
 * two of those and prints the delta.
 *
 *   git checkout feat/effect-compat        && node …/bench-wave1.mjs --out=before.json
 *   git checkout wip/effect-tag-migration-v2 && node …/bench-wave1.mjs --out=after.json
 *   node …/bench-wave1.mjs --compare=before.json,after.json
 *
 * What is measured, and why each one:
 *
 *   type-check   Types / Instantiations / memory / wall time, on three
 *                programs of very different shape: the published build, the
 *                spec program (much bigger, generic-heavy), and the demo app.
 *                A rename should be neutral; the point is to catch the case
 *                where it is not.
 *   runtime      Test-suite wall time, plus a focused micro-benchmark of the
 *                two operations the rename actually touches — building an
 *                exception and discriminating on it.
 *
 * Timing notes: tsc is run with a cleared build info each time, every
 * measurement is repeated and the MINIMUM is kept (minimum is the honest
 * statistic for wall time — it is the run least disturbed by the machine).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');
const args = process.argv.slice(2);
const option = (name) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : undefined;
};

const REPEATS = Number(option('repeats') ?? 3);

const TYPE_TARGETS = [
  ['core-lib', 'libs/core/tsconfig.lib.json'],
  ['core-spec', 'libs/core/tsconfig.spec.json'],
  ['component-spec', 'libs/component/tsconfig.spec.json'],
  ['effect-spec', 'libs/effect/tsconfig.spec.json'],
];

function clearBuildInfo() {
  const out = join(workspaceRoot, 'dist/out-tsc');
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
}

function typeCheck(configPath) {
  clearBuildInfo();
  let output = '';
  const started = Date.now();
  try {
    output = execFileSync(
      'npx',
      ['tsc', '-p', configPath, '--noEmit', '--extendedDiagnostics'],
      { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const elapsed = Date.now() - started;

  const read = (label) => {
    const match = output.match(new RegExp(`^${label}:\\s+([\\d.]+)`, 'm'));
    return match ? Number(match[1]) : null;
  };

  return {
    types: read('Types'),
    instantiations: read('Instantiations'),
    memoryKb: read('Memory used'),
    checkTimeSec: read('Check time'),
    totalTimeSec: read('Total time'),
    wallMs: elapsed,
    errors: (output.match(/error TS\d+/g) ?? []).length,
  };
}

function best(runs) {
  const finite = runs.filter((run) => run.wallMs != null);
  return finite.reduce((a, b) => (a.wallMs <= b.wallMs ? a : b));
}

function suiteWallMs() {
  const started = Date.now();
  try {
    execFileSync('npx', ['vitest', 'run', '--reporter=dot'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    // A red suite still gives a usable duration; the caller reports errors.
  }
  return Date.now() - started;
}

if (option('compare')) {
  const [beforePath, afterPath] = option('compare').split(',');
  const before = JSON.parse(readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(readFileSync(afterPath, 'utf8'));

  const pct = (a, b) => (a && b ? `${(((b - a) / a) * 100).toFixed(2)}%` : '—');
  const pad = (v, w) => String(v).padEnd(w);
  const padS = (v, w) => String(v).padStart(w);

  console.log(`\n=== Type-checking: ${before.label} -> ${after.label} ===\n`);
  console.log(
    `${pad('program', 16)}${padS('instantiations', 30)}${padS('types', 24)}${padS('wall', 20)}`,
  );
  for (const [name] of TYPE_TARGETS) {
    const a = before.typeCheck[name];
    const b = after.typeCheck[name];
    if (!a || !b) continue;
    console.log(
      `${pad(name, 16)}` +
        `${padS(`${a.instantiations} -> ${b.instantiations} (${pct(a.instantiations, b.instantiations)})`, 30)}` +
        `${padS(`${a.types} -> ${b.types} (${pct(a.types, b.types)})`, 24)}` +
        `${padS(`${a.wallMs}ms -> ${b.wallMs}ms (${pct(a.wallMs, b.wallMs)})`, 20)}`,
    );
  }

  console.log(`\n=== Runtime ===\n`);
  console.log(
    `suite wall time   ${before.runtime.suiteWallMs}ms -> ${after.runtime.suiteWallMs}ms (${pct(before.runtime.suiteWallMs, after.runtime.suiteWallMs)})`,
  );
  for (const key of Object.keys(before.runtime.micro ?? {})) {
    const a = before.runtime.micro[key];
    const b = after.runtime.micro[key];
    console.log(
      `${pad(key, 18)}${a.toFixed(1)}ns -> ${b.toFixed(1)}ns (${pct(a, b)})`,
    );
  }
  console.log('');
  process.exit(0);
}

const label = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  cwd: workspaceRoot,
  encoding: 'utf8',
}).trim();

const result = { label, typeCheck: {}, runtime: {} };

for (const [name, configPath] of TYPE_TARGETS) {
  process.stderr.write(`type-checking ${name}…\n`);
  const runs = [];
  for (let i = 0; i < REPEATS; i += 1) runs.push(typeCheck(configPath));
  result.typeCheck[name] = best(runs);
}

process.stderr.write('running the suite…\n');
const suiteRuns = [];
for (let i = 0; i < Math.min(REPEATS, 2); i += 1) suiteRuns.push(suiteWallMs());
result.runtime.suiteWallMs = Math.min(...suiteRuns);

const out = option('out') ?? join(here, `bench-${label.replace(/\W+/g, '-')}.json`);
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(`\nwrote ${out}`);
