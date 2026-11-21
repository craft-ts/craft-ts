// Counts real renderer constructors without wrapping component functions.
// Run from the repository root. Diagnostic build only: never time this build.
import assert from 'node:assert/strict';
import ts from 'typescript';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { craftCompiler } from '../../../dist/libs/compiler/src/vite.js';
const root = process.cwd(),
  app = join(root, 'apps/framework-benchmark'),
  output = resolve(root, 'tmp/compiler-followup/counts');
await mkdir(output, { recursive: true });
const counter = {
  name: 'renderer-constructor-count',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/render/interpreter.ts')) return null;
    const ast = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true),
      edits = [];
    for (const node of ast.statements) {
      if (!ts.isClassDeclaration(node) || !node.name) continue;
      const mode =
        node.name.text === 'CompiledComponentRenderedNode'
          ? 'compiled'
          : node.name.text === 'ComponentRenderedNode'
            ? 'generic'
            : undefined;
      if (!mode) continue;
      const constructor = node.members.find(ts.isConstructorDeclaration);
      assert(constructor?.body);
      const name =
        mode === 'compiled'
          ? 'node.component[CRAFT_COMPONENT].name'
          : 'component[CRAFT_COMPONENT].name';
      edits.push({
        at: constructor.body.getStart(ast) + 1,
        text: `{const counters=((globalThis as any).__rendererMounts??={});const key=${JSON.stringify(mode + ':')}+${name};counters[key]=(counters[key]??0)+1;}`,
      });
    }
    assert.equal(edits.length, 2);
    for (const edit of edits.sort((a, b) => b.at - a.at))
      code = code.slice(0, edit.at) + edit.text + code.slice(edit.at);
    return { code, map: null };
  },
};
await build({
  configFile: join(app, 'vite.config.mjs'),
  logLevel: 'error',
  plugins: [craftCompiler(), counter],
  resolve: {
    alias: [
      {
        find: '@craft-ts/component/compiler-runtime',
        replacement: join(root, 'libs/component/src/compiler-runtime.ts'),
      },
      ...['core', 'component', 'style'].map((name) => ({
        find: '@craft-ts/' + name,
        replacement: join(root, 'libs/' + name + '/src/index.ts'),
      })),
    ],
  },
  build: {
    outDir: join(output, 'dist'),
    emptyOutDir: true,
    minify: false,
    rolldownOptions: {
      input: { 'craft-page': join(app, 'craft-page/index.html') },
    },
  },
});
const server = await preview({
    configFile: join(app, 'vite.config.mjs'),
    logLevel: 'error',
    build: { outDir: join(output, 'dist') },
  }),
  browser = await chromium.launch({ headless: true });
const result = {};
try {
  for (const scale of [1, 2]) {
    const context = await browser.newContext(),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:${server.httpServer.address().port}/craft-page/?scale=${scale}`,
    );
    await page.waitForFunction(() =>
      Number.isFinite(window.__bench?.bootstrapMs),
    );
    result[scale] = await page.evaluate(() => ({
      ...globalThis.__rendererMounts,
    }));
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
await writeFile(
  join(output, 'report.json'),
  JSON.stringify(result, null, 2) + '\n',
);
for (const [scale, counts] of Object.entries(result)) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0),
    compiled = Object.entries(counts)
      .filter(([key]) => key.startsWith('compiled:'))
      .reduce((a, [, b]) => a + b, 0);
  console.log({ scale, total, compiled, share: compiled / total });
  console.log(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18),
  );
}
