#!/usr/bin/env node
// Verification copies are separate from both the checkout and timed browsers.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const app = dirname(fileURLToPath(import.meta.url)),
  workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.MOUNT_SHAPE_OUTPUT ?? 'tmp/mount-shape',
);
const variantName = process.env.VERIFY_VARIANT ?? 'shape-lean';
const verifyStage = process.env.VERIFY_STAGE ?? 'confirm';
const roots = Object.fromEntries(
  ['baseline', 'prototype'].map((k) => [
    k,
    join(output, 'verification-' + variantName + '-' + k),
  ]),
);
const report = JSON.parse(
  await readFile(join(output, verifyStage, 'timing.json'), 'utf8'),
);
const variant = report.variants.find((v) => v.name === variantName);
assert(variant);
for (const [kind, root] of Object.entries(roots)) {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  for (const path of [
    'libs/core',
    'libs/component',
    'libs/style',
    'libs/effect',
    'libs/stream',
    'libs/test-type',
    'package.json',
    'tsconfig.base.json',
    'vitest.config.ts',
  ])
    await cp(join(workspace, path), join(root, path), { recursive: true });
  await symlink(join(workspace, 'node_modules'), join(root, 'node_modules'));
  if (kind === 'prototype')
    for (const path of variant.modified.filter((p) => p.startsWith('libs/')))
      await cp(
        join(output, verifyStage, 'prototypes', variantName, path),
        join(root, path),
      );
}
// Expose exactly the private implementation only in the verification copy.
const render = join(
  roots.prototype,
  'libs/component/src/lib/render/interpreter.ts',
);
await writeFile(
  render,
  (await readFile(render, 'utf8')) +
    '\nexport {prototypeRendererSignal,prototypeReadForInput,prototypeInputReads,childContext};\n',
);
const evidence = {};
for (const [kind, root] of Object.entries(roots))
  for (const library of ['core', 'component']) {
    const config = join(root, `libs/${library}/tsconfig.spec.json`);
    const json = ts.readConfigFile(config, ts.sys.readFile);
    assert(!json.error);
    const parsed = ts.parseJsonConfigFileContent(
      json.config,
      ts.sys,
      dirname(config),
    );
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ({
        file: d.file?.fileName.replace(root + '/', ''),
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    evidence[kind + '-' + library] = diagnostics;
  }
for (const library of ['core', 'component'])
  assert.deepEqual(
    evidence['prototype-' + library],
    evidence['baseline-' + library],
    `New ${library} type diagnostics`,
  );
await writeFile(
  join(output, 'typecheck-comparison-' + variantName + '.json'),
  JSON.stringify(evidence, null, 2) + '\n',
);
for (const [name, library, path] of [
  ['next-contracts', 'core', 'lib/prototype-next.contracts.spec.ts'],
  [
    'private-cell',
    'component',
    'lib/render/prototype-next.private-cell.spec.ts',
  ],
])
  await cp(
    join(app, `prototype-runtime/${name}.spec.ts.txt`),
    join(roots.prototype, `libs/${library}/src/${path}`),
  );
// Existing exact identity/hydration/cleanup tests are reused, without generated assertions.
await cp(
  join(app, 'prototype-runtime/legacy-contracts.spec.ts.txt'),
  join(
    roots.prototype,
    'libs/core/src/lib/prototype-next.legacy-contracts.spec.ts',
  ),
);
// Inspect the real planned component's owner only in this verification copy.
await writeFile(
  render,
  (await readFile(render, 'utf8')).replace(
    'this.source = prototypeRendererSignal(node.props);',
    '(globalThis as any).__prototypeInspectOwner?.(this.injector.get(ElementRef).nativeElement);\n    this.source = prototypeRendererSignal(node.props);',
  ),
);
await cp(
  join(app, 'prototype-runtime/more-owner.contracts.spec.ts.txt'),
  join(
    roots.prototype,
    'libs/core/src/lib/prototype-more.owner-contracts.spec.ts',
  ),
);
const extraSpec = (
  await readFile(
    join(app, 'prototype-runtime/more-component.contracts.spec.ts.txt'),
    'utf8',
  )
).replace('PROTOTYPE_HAS_BORROWED_RANGES', 'true');
await writeFile(
  join(
    roots.prototype,
    'libs/component/src/lib/render/prototype-more.component-contracts.spec.ts',
  ),
  extraSpec,
);
await cp(
  join(app, 'prototype-runtime/shape-context.contracts.spec.ts.txt'),
  join(
    roots.prototype,
    'libs/component/src/lib/render/prototype-shape.context-contracts.spec.ts',
  ),
);
await cp(
  join(app, 'prototype-runtime/shape-component.contracts.spec.ts.txt'),
  join(
    roots.prototype,
    'libs/component/src/lib/render/prototype-shape.component-contracts.spec.ts',
  ),
);
if (
  ['shape-compact', 'shape-slots', 'shape-all', 'shape-layout'].includes(
    variantName,
  )
)
  await cp(
    join(app, 'prototype-runtime/shape-owner.contracts.spec.ts.txt'),
    join(
      roots.prototype,
      'libs/core/src/lib/prototype-shape.owner-contracts.spec.ts',
    ),
  );
async function run(name, args) {
  const file = join(output, name + '-' + variantName + '.log');
  let log = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: workspace,
      env: process.env,
    });
    child.stdout.on('data', (s) => {
      log += s;
    });
    child.stderr.on('data', (s) => {
      log += s;
    });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  await writeFile(file, log);
  console.log(name + ': ' + code + '; ' + file);
  if (code) console.log(log.slice(-8000));
  assert.equal(code, 0, name);
}
const vitest = join(workspace, 'node_modules/vitest/vitest.mjs');
await run('component-tests', [
  vitest,
  'run',
  '--config',
  join(roots.prototype, 'libs/component/vitest.config.ts'),
]);
await run('core-targeted-tests', [
  vitest,
  'run',
  '--config',
  join(roots.prototype, 'libs/core/vitest.config.ts'),
  'craft-effect.spec.ts',
  'host/craft-signal.spec.ts',
  'host/craft-linked-signal.spec.ts',
  'craft-replay-target.spec.ts',
  'prototype-next.',
  'prototype-more.',
  'prototype-shape.',
  'host/craft-injector.spec.ts',
  'host/craft-compat.spec.ts',
]);
await writeFile(
  join(output, 'verification-summary-' + variantName + '.json'),
  JSON.stringify(
    {
      sourceTypeDiagnostics: Object.fromEntries(
        Object.entries(evidence).map(([k, v]) => [k, v.length]),
      ),
      typeDiagnosticsIdentical: true,
      componentTests: 'passed',
      coreTargetedTests: 'passed',
    },
    null,
    2,
  ) + '\n',
);
