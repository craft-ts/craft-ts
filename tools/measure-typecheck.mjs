#!/usr/bin/env node
/**
 * Measures what a typecheck pass costs, so a change to the type-level plumbing
 * can be accepted or rejected on a number instead of a feeling.
 *
 * Reports the two figures that actually move when generic machinery is added to
 * a hot path: wall time, and the instantiation count `tsc --extendedDiagnostics`
 * prints. Instantiations are the reliable one — wall time on a laptop drifts by
 * more than the effect we are looking for.
 *
 * Usage:
 *   node tools/measure-typecheck.mjs                       # apps/demo, 1 run
 *   node tools/measure-typecheck.mjs -p libs/core/tsconfig.spec.json
 *   node tools/measure-typecheck.mjs --runs 3              # median of 3
 *   node tools/measure-typecheck.mjs --baseline            # write the baseline
 *   node tools/measure-typecheck.mjs --compare             # against the baseline
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(repoRoot, 'tools', '.typecheck-baseline.json');
const DEFAULT_PROJECT = 'apps/demo/tsconfig.app.json';

function parseArgs(argv) {
  const args = {
    project: DEFAULT_PROJECT,
    runs: 1,
    baseline: false,
    compare: false,
    threshold: 0.15,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-p' || arg === '--project') args.project = argv[(i += 1)];
    else if (arg === '--runs') args.runs = Number(argv[(i += 1)]);
    else if (arg === '--baseline') args.baseline = true;
    else if (arg === '--compare') args.compare = true;
    else if (arg === '--threshold') args.threshold = Number(argv[(i += 1)]);
    else if (arg === '--help' || arg === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    }
  }
  return args;
}

const DIAGNOSTIC_KEYS = {
  'Instantiations:': 'instantiations',
  'Types:': 'types',
  'Symbols:': 'symbols',
  'Memory used:': 'memoryKb',
  'Check time:': 'checkSeconds',
  'Total time:': 'totalSeconds',
};

function parseDiagnostics(output) {
  const result = {};
  for (const line of output.split('\n')) {
    const [rawLabel, rawValue] = line.split(/:\s+/);
    if (rawValue === undefined) continue;
    const key = DIAGNOSTIC_KEYS[`${rawLabel.trim()}:`];
    if (!key) continue;
    result[key] = Number(rawValue.replace(/[^\d.]/g, ''));
  }
  return result;
}

function runOnce(project) {
  const started = Date.now();
  let output = '';
  try {
    output = execFileSync(
      'npx',
      ['tsc', '-p', project, '--noEmit', '--extendedDiagnostics'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    // A project with pre-existing errors still reports its diagnostics, and the
    // point of this tool is the cost of checking, not whether it passes.
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  return { ms: Date.now() - started, ...parseDiagnostics(output) };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(project, runs) {
  const samples = Array.from({ length: runs }, () => runOnce(project));
  return {
    project,
    runs,
    ms: median(samples.map((sample) => sample.ms)),
    instantiations: median(samples.map((sample) => sample.instantiations ?? 0)),
    types: median(samples.map((sample) => sample.types ?? 0)),
    memoryKb: median(samples.map((sample) => sample.memoryKb ?? 0)),
  };
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

function percentDelta(before, after) {
  if (!before) return 0;
  return (after - before) / before;
}

const args = parseArgs(process.argv.slice(2));
const result = measure(args.project, args.runs);

console.log(JSON.stringify(result, null, 2));

if (args.baseline) {
  const baseline = readBaseline();
  baseline[args.project] = { ...result, recordedAt: new Date().toISOString() };
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`baseline written to ${BASELINE_PATH}`);
}

if (args.compare) {
  const recorded = readBaseline()[args.project];
  if (!recorded) {
    console.error(`no baseline recorded for ${args.project}`);
    process.exit(2);
  }
  const deltas = {
    ms: percentDelta(recorded.ms, result.ms),
    instantiations: percentDelta(recorded.instantiations, result.instantiations),
  };
  console.log(
    JSON.stringify(
      {
        baseline: { ms: recorded.ms, instantiations: recorded.instantiations },
        delta: {
          ms: `${(deltas.ms * 100).toFixed(1)}%`,
          instantiations: `${(deltas.instantiations * 100).toFixed(1)}%`,
        },
        threshold: `${(args.threshold * 100).toFixed(0)}%`,
      },
      null,
      2,
    ),
  );
  const regressed = Object.values(deltas).some(
    (delta) => delta > args.threshold,
  );
  if (regressed) {
    console.error(
      'REGRESSION — over threshold. Task 3b (dedicated typecheck pass) is triggered.',
    );
    process.exit(1);
  }
}
