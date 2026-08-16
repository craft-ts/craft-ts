import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

const config = process.argv[2];
if (!config) {
  process.stderr.write(
    'Usage: node tools/run-lib-vitest.mjs <vitest.config.ts> [...args]\n',
  );
  process.exit(1);
}

const forwarded = [];
for (let index = 3; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--include' || argument === '--testPathPattern') {
    forwarded.push(toFileFilter(process.argv[++index] ?? ''));
  } else if (
    argument.startsWith('--include=') ||
    argument.startsWith('--testPathPattern=')
  ) {
    forwarded.push(toFileFilter(argument.slice(argument.indexOf('=') + 1)));
  } else {
    forwarded.push(argument);
  }
}

const child = spawn(
  process.execPath,
  [
    resolve(import.meta.dirname, '../node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    config,
    ...forwarded,
  ],
  {
    cwd: resolve(import.meta.dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

function toFileFilter(pattern) {
  if (!pattern) return pattern;
  if (
    pattern.startsWith('src/') ||
    pattern.startsWith('libs/') ||
    pattern.startsWith('**/')
  ) {
    return pattern;
  }
  return `src/${pattern}`;
}
