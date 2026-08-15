import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

execFileSync(process.execPath, [join(packageRoot, 'scripts/bundle-docs.mjs')], {
  stdio: 'inherit',
  cwd: packageRoot,
});

execFileSync(
  join(packageRoot, '../../node_modules/.bin/tsc'),
  ['-p', join(packageRoot, 'tsconfig.json')],
  { stdio: 'inherit', cwd: packageRoot },
);
