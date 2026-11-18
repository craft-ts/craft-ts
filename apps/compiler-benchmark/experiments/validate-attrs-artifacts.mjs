import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { lab, workspace } from './prepare.mjs';
const hash = (source) => createHash('sha256').update(source).digest('hex');
const reference = 'attrs-reference',
  candidate = 'attrs-final',
  app = join(workspace, 'apps/compiler-benchmark');
const main = await readFile(join(app, 'main.ts'), 'utf8'),
  records = [];
for (const id of [reference, candidate]) {
  const result = spawnSync(
    join(workspace, 'node_modules/.bin/tsc'),
    ['-p', join(lab, 'roots', id, 'libs/compiler/tsconfig.lib.json')],
    { cwd: workspace, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
}
for (const mode of ['runtime', 'compiled', 'lean']) {
  for (const id of [reference, candidate]) {
    const root = join(lab, 'roots', id),
      { craftCompiler } = await import(
        pathToFileURL(join(root, 'dist/libs/compiler/src/vite.js'))
      ),
      { compileModule } = await import(
        pathToFileURL(join(root, 'dist/libs/compiler/src/compiler.js'))
      );
    const generated =
      mode === 'runtime'
        ? main
        : compileModule(main, join(app, 'main.ts'), { lean: mode === 'lean' })
            .code;
    const result = await build({
      configFile: false,
      root: app,
      logLevel: 'error',
      plugins:
        mode === 'runtime' ? [] : [craftCompiler({ lean: mode === 'lean' })],
      resolve: {
        alias: [
          {
            find: '@craft-ts/component/compiler-runtime',
            replacement: join(root, 'libs/component/src/compiler-runtime.ts'),
          },
          ...['component', 'core', 'style'].map((name) => ({
            find: '@craft-ts/' + name,
            replacement: join(root, 'libs', name, 'src/index.ts'),
          })),
        ],
      },
      build: {
        write: false,
        minify: 'oxc',
        target: 'es2022',
        rolldownOptions: { input: join(app, 'index.html') },
      },
    });
    const artifacts = result.output
      .map((item) => {
        const source = item.type === 'chunk' ? item.code : item.source;
        return {
          file: item.fileName,
          type: item.type,
          sha256: hash(source),
          bytes: Buffer.byteLength(source),
          gzip: gzipSync(source).length,
        };
      })
      .toSorted((a, b) => a.file.localeCompare(b.file));
    const modules = result.output
      .filter((item) => item.type === 'chunk')
      .flatMap((item) => item.moduleIds);
    assert(
      !modules.some(
        (file) =>
          file.includes('/libs/compiler/src/') || file.includes('/typescript/'),
      ),
    );
    records.push({
      id,
      mode,
      sourceMainSha256: hash(main),
      generatedMainSha256: hash(generated),
      artifacts,
      modules,
    });
  }
  const pair = records.filter((record) => record.mode === mode);
  assert.equal(pair.length, 2);
}
await writeFile(
  join(lab, 'tests/attrs-final-artifacts.json'),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      records,
      passed: true,
      conclusion:
        'Actual minified artifact sizes for the corrected runtime in runtime, standard and lean modes; timing overhead is measured separately. No compiler or TypeScript parser is shipped to the browser.',
    },
    null,
    2,
  ) + '\n',
);
console.log('Runtime, standard and lean ordinary artifact sizes recorded.');
