import assert from 'node:assert/strict';
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  realpath,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { lab, workspace } from './prepare.mjs';
const root =
  process.env.IMPORT_LIBRARY_ROOT ?? join(lab, 'roots/imported-lists');
const { craftCompiler } = await import(
  pathToFileURL(join(root, 'dist/libs/compiler/src/vite.js'))
);
const app = await realpath(
  await mkdtemp(join(tmpdir(), 'craft-import-proof-')),
);
const row = `import {craftComponent,div} from '@craft-ts/component'; export const Row=craftComponent('WatchRow',{},(inputs:any)=>div(inputs.row));`;
const main = `import {forNode} from '@craft-ts/component';import {Row} from './row'; export const node=forNode([], {track:r=>r.id}, row=>Row({row}));`;
await writeFile(join(app, 'main.ts'), main);
await writeFile(join(app, 'row.ts'), row);
const captures = [],
  waiters = [],
  events = [];
let watcher;
const next = () =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('watch build timeout')), 15000);
    waiters.push({
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
try {
  watcher = await build({
    configFile: false,
    root: app,
    logLevel: 'error',
    plugins: [
      craftCompiler({ lean: true, imports: true }),
      {
        name: 'capture-imported-list-proof',
        transform(source, id) {
          if (id === join(app, 'main.ts'))
            captures.push({
              source,
              metadata: source.includes('ɵwithCompiledItem'),
            });
          return null;
        },
      },
    ],
    resolve: {
      alias: [
        {
          find: '@craft-ts/component/compiler-runtime',
          replacement: join(root, 'libs/component/src/compiler-runtime.ts'),
        },
        ...['core', 'component', 'style'].map((name) => ({
          find: '@craft-ts/' + name,
          replacement: join(root, 'libs', name, 'src/index.ts'),
        })),
      ],
    },
    build: {
      outDir: join(app, 'dist'),
      emptyOutDir: true,
      minify: false,
      watch: {},
      rolldownOptions: { input: join(app, 'main.ts') },
    },
  });
  watcher.on('event', (event) => {
    events.push(event.code);
    if (event.code === 'ERROR') {
      for (const waiter of waiters.splice(0)) waiter.reject(event.error);
    }
    if (event.code === 'BUNDLE_END') {
      const waiter = waiters.shift();
      waiter?.resolve(captures.at(-1));
    }
  });
  const first = await next();
  assert(first.metadata, 'constant importer specialized in real Vite build');
  const second = next();
  await writeFile(
    join(app, 'row.ts'),
    row.replace('export const Row', 'export let Row'),
  );
  const mutable = await second;
  assert.equal(
    mutable.metadata,
    false,
    'mutable export invalidates importer metadata',
  );
  const third = next();
  await writeFile(join(app, 'row.ts'), row);
  const restored = await third;
  assert(restored.metadata, 'restored constant is proved again');
  const fourth = next();
  await writeFile(join(app, 'main.ts'), main + '\n// importer-only edit\n');
  const cachedDependency = await fourth;
  await mkdir(join(lab, 'tests'), { recursive: true });
  await writeFile(
    join(
      lab,
      'tests',
      process.env.IMPORT_WATCH_OUTPUT ?? 'imported-watch.json',
    ),
    JSON.stringify(
      {
        passed: true,
        events,
        captures,
        sources: { main, row },
        cachedDependencyMetadata: cachedDependency.metadata,
        root,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Real Vite watch: const -> let -> const passed; unchanged cached dependency specialization = ' +
      cachedDependency.metadata,
  );
} finally {
  await watcher?.close();
  await rm(app, { recursive: true, force: true });
}
