import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const tscPath = resolve(workspaceRoot, 'node_modules/.bin/tsc');
const nonBlocking = process.argv.includes('--non-blocking');
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

function writeStatus(status) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(
    statusPath,
    `${JSON.stringify({ status, updatedAt: new Date().toISOString() })}\n`,
  );
}

writeStatus('running');

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
