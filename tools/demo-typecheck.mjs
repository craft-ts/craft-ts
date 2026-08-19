import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const statusPath = resolve(workspaceRoot, 'tmp/demo-typecheck-status.json');
const tscPath = resolve(workspaceRoot, 'node_modules/.bin/tsc');
const nonBlocking = process.argv.includes('--non-blocking');

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
  ['-p', 'tsconfig.app.json', '--noEmit', '--pretty', 'false'],
  {
    cwd: resolve(workspaceRoot, 'apps/demo'),
    stdio: 'inherit',
  },
);

const status = result.status === 0 ? 'passed' : 'failed';
writeStatus(status);
process.exitCode = result.status === 0 || nonBlocking ? 0 : result.status ?? 1;
