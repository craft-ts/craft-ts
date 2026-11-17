import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { lab, workspace } from './prepare.mjs';

const full = process.argv.includes('--full');
const ids = process.argv.slice(2).filter((x) => !x.startsWith('--'));
await mkdir(join(lab, 'tests'), { recursive: true });
for (const id of ids.length
  ? ids
  : [
      'baseline',
      'empty-wrapper',
      'bound-resolvers',
      'mark-once-ceiling',
      'mark-frozen',
    ]) {
  const root = join(lab, 'roots', id),
    core = join(root, 'libs/core');
  const config = join(core, 'vitest.campaign.config.ts');
  await writeFile(
    config,
    (await readFile(join(core, 'vitest.config.ts'), 'utf8')).replace(
      'tsconfigPaths: true',
      'tsconfigPaths: false',
    ),
  );
  const output = join(
    lab,
    'tests',
    id + (full ? '-full' : '-contracts') + '.json',
  );
  const result = spawnSync(
    join(workspace, 'node_modules/.bin/vitest'),
    [
      'run',
      '--config',
      config,
      ...(!full ? ['performance-campaign.spec.ts'] : []),
      '--reporter=json',
      '--outputFile=' + output,
    ],
    { cwd: workspace, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  await writeFile(output + '.log', result.stdout + '\n' + result.stderr);
  const report = JSON.parse(await readFile(output, 'utf8'));
  console.log(
    JSON.stringify({
      id,
      full,
      exitCode: result.status,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      failures: report.testResults
        .filter((t) => t.status === 'failed')
        .map((t) => ({
          file: t.name,
          message: t.message,
          assertions: t.assertionResults
            .filter((a) => a.status === 'failed')
            .map((a) => ({ name: a.fullName, messages: a.failureMessages })),
        })),
    }),
  );
}
