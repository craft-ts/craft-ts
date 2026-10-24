import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function assertSuccess(result, label) {
  if (result.status === 0) return;
  throw new Error(
    `${label} failed with exit code ${result.status ?? 'unknown'}:\n${result.stdout}${result.stderr}`,
  );
}

const build = run('npx', ['nx', 'run', 'demo:build:development', '--skipSync']);
assertSuccess(build, 'Demo style dump build');

const check = run('npx', [
  'tsx',
  'libs/dev-tools/src/bin/craft-graph.ts',
  '--style-contrast',
  '--style-dump',
  'tmp/craft-style-graph.json',
  '--project',
  'apps/demo/tsconfig.graph.json',
  '--allow-indeterminate',
  '--json',
]);

let report;
try {
  report = JSON.parse(check.stdout);
} catch {
  assertSuccess(check, 'Demo text contrast analysis');
  throw new Error('Demo text contrast analysis did not return JSON.');
}

const skipLinks = report.results.filter(
  (result) =>
    result.component === 'App' &&
    result.element === 'a' &&
    result.foreground?.source?.includes('craftSkipLink-link'),
);
if (skipLinks.length !== 1) {
  throw new Error(
    `Expected exactly one analyzed Skip to content link in App; found ${skipLinks.length}.`,
  );
}

const [skipLink] = skipLinks;
if (skipLink.verdict !== 'pass' || skipLink.ratio < 4.5) {
  throw new Error(
    `Skip to content must pass WCAG AA; got ${skipLink.ratio}:1 (${skipLink.verdict}).`,
  );
}

const failures = report.results.filter((result) => result.verdict === 'fail');
if (failures.length > 0) {
  const examples = failures
    .slice(0, 8)
    .map(
      (result) =>
        `${result.component} ${result.element} ${result.scenario.id}: ${result.ratio}:1 < ${result.required}:1`,
    )
    .join('\n');
  throw new Error(
    `Demo text contrast has ${failures.length} proven violation(s):\n${examples}`,
  );
}

assertSuccess(check, 'Demo text contrast analysis');
console.log(
  `Demo text contrast: ${report.summary.pass} pass, 0 fail, ${report.summary.indeterminate} indeterminate. Skip to content passes at ${skipLink.ratio.toFixed(2)}:1. Indeterminate results are allowed by this target and remain visible in the report.`,
);
