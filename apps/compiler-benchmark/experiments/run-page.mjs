// Derive the existing page lab without modifying the shared application. Each
// candidate supplies BOTH its libraries and its compiler plugin.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { cpus, platform, release } from 'node:os';
import { lab, workspace, replaceOnce, baseCommit } from './prepare.mjs';

const ids = process.argv.slice(2);
if (!ids.length) throw Error('Pass candidate IDs');
const output = join(lab, process.env.CAMPAIGN_OUTPUT ?? 'services-page');
await mkdir(output, { recursive: true });
const source = await readFile(
  join(workspace, 'apps/framework-benchmark/page-lab.mjs'),
  'utf8',
);
let runner = source.replace(
  "from './page-count.plugin.mjs'",
  'from ' +
    JSON.stringify(
      join(workspace, 'apps/framework-benchmark/page-count.plugin.mjs'),
    ),
);
runner = replaceOnce(
  runner,
  'const app = dirname(fileURLToPath(import.meta.url));',
  'const app = ' +
    JSON.stringify(join(workspace, 'apps/framework-benchmark')) +
    ';',
);
runner = replaceOnce(
  runner,
  "const configFile = join(app, 'vite.config.mjs');",
  'const configFile = false;',
);
runner = runner.replaceAll('    configFile,', '    configFile, root: app,');
runner = runner.replace(
  'build: { outDir: dist },',
  "build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 },",
);
runner = runner.replace(
  "(await import('../../dist/libs/compiler/src/vite.js'))",
  "(await import(new URL('file://' + variant.root + '/dist/libs/compiler/src/vite.js').href))",
);
runner = runner.replace(
  'const throttle =',
  `let seed = 17112026;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/2**32; };
const throttle =`,
);
runner = replaceOnce(
  runner,
  'const order = [...variants].sort(() => Math.random() - 0.5);',
  `const order = [...variants];
        for (let i=order.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }`,
);
const runnerPath = join(lab, 'page-lab.mjs');
await writeFile(runnerPath, runner);
const builds = {};
for (const id of ids) {
  const root = join(lab, 'roots', id);
  const started = performance.now();
  const compilation = spawnSync(
    join(workspace, 'node_modules/.bin/tsc'),
    ['-p', join(root, 'libs/compiler/tsconfig.lib.json')],
    { cwd: workspace, encoding: 'utf8' },
  );
  await writeFile(
    join(output, id + '-tsc.log'),
    compilation.stdout + '\n' + compilation.stderr,
  );
  if (compilation.status !== 0) throw Error(id + ' compiler build failed');
  builds[id] = { compilerBuildMs: performance.now() - started };
}
process.env.PAGE_VARIANTS = ids
  .map((id) => id + '=craft-page@' + join(lab, 'roots', id))
  .join(',');
process.env.PAGE_COMPILER_LABELS =
  process.env.CAMPAIGN_MODE === 'runtime' ? '' : ids.join(',');
const requestedOptions = JSON.parse(process.env.PAGE_COMPILER_OPTIONS ?? '{}');
process.env.PAGE_COMPILER_OPTIONS = JSON.stringify(
  Object.fromEntries(
    ids.map((id) => [id, { lean: true, ...requestedOptions[id] }]),
  ),
);
process.env.PAGE_COUNT = 'false';
process.env.PAGE_SCALES ??= '2';
process.env.PAGE_RUNS ??= '5';
process.env.PAGE_ITERATIONS ??= '3';
process.env.PAGE_OUTPUT = output;
await import(pathToFileURL(runnerPath));
async function files(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (entry) =>
        entry.isDirectory()
          ? files(join(dir, entry.name))
          : [join(dir, entry.name)],
      ),
    )
  ).flat();
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
for (const id of ids) {
  const root = join(lab, 'roots', id);
  const js = (await files(join(output, 'dist', id))).filter((f) =>
    f.endsWith('.js'),
  );
  const buffers = await Promise.all(js.map((f) => readFile(f)));
  builds[id] = {
    ...builds[id],
    jsBytes: buffers.reduce((n, b) => n + b.length, 0),
    gzipBytes: buffers.reduce((n, b) => n + gzipSync(b).length, 0),
    artifacts: js.map((f, i) => ({ file: f, sha256: hash(buffers[i]) })),
    candidate: JSON.parse(await readFile(join(root, 'candidate.json'), 'utf8')),
  };
}
await writeFile(
  join(output, 'provenance.json'),
  JSON.stringify(
    {
      baseCommit,
      ids,
      runs: process.env.PAGE_RUNS,
      iterations: process.env.PAGE_ITERATIONS,
      scales: process.env.PAGE_SCALES,
      cpu: cpus()[0].model,
      platform: platform(),
      release: release(),
      node: process.version,
      runnerSha256: hash(runner),
      runnerSource: runner,
      builds,
    },
    null,
    2,
  ) + '\n',
);
