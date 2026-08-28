import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const tscPath = resolve(workspaceRoot, 'node_modules/.bin/tsc');
const nonBlocking = process.argv.includes('--non-blocking');
const watch = process.argv.includes('--watch');
const projectArgument = process.argv.find((argument) =>
  argument.startsWith('--project='),
);
const configArgument = process.argv.find((argument) =>
  argument.startsWith('--config='),
);
const projectName = projectArgument?.slice('--project='.length) || 'demo';
const configName = configArgument?.slice('--config='.length) || 'tsconfig.app.json';
const projectRoot = resolve(workspaceRoot, 'apps', projectName);
const statusPath = resolve(
  workspaceRoot,
  `tmp/${projectName}-typecheck-status.json`,
);
const ansiEscapePattern = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  'g',
);

function writeStatus(status) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(
    statusPath,
    `${JSON.stringify({ status, updatedAt: new Date().toISOString() })}\n`,
  );
}

writeStatus('running');

if (watch) {
  const child = spawn(
    tscPath,
    [
      '-p',
      configName,
      '--noEmit',
      '--pretty',
      'false',
      '--watch',
      '--preserveWatchOutput',
      'false',
    ],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  const inspectOutput = (chunk) => {
    output = `${output}${chunk}`.slice(-2_000);
    const normalized = output.replace(ansiEscapePattern, '');
    const results = normalized.matchAll(/Found\s+(\d+)\s+errors?\./g);
    const result = [...results].at(-1);

    if (result) writeStatus(Number(result[1]) === 0 ? 'passed' : 'failed');
  };

  const forward = (stream) => (chunk) => {
    stream.write(chunk);
    inspectOutput(chunk);
  };

  child.stdout.on('data', forward(process.stdout));
  child.stderr.on('data', forward(process.stderr));

  const stop = (signal) => child.kill(signal);
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal === null && code !== 0) writeStatus('failed');
    process.exitCode = nonBlocking ? 0 : code ?? 1;
  });
} else {
  const result = spawnSync(
    tscPath,
    ['-p', configName, '--noEmit', '--pretty', 'false'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  );

  const status = result.status === 0 ? 'passed' : 'failed';
  writeStatus(status);
  process.exitCode = result.status === 0 || nonBlocking ? 0 : result.status ?? 1;
}
