import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { lab, workspace } from './prepare.mjs';
const run = promisify(execFile);
const id = 'compiler-activation-complete',
  root = join(lab, 'roots', id);
const checks = [
  {
    name: 'typecheck',
    bin: 'tsc',
    args: [
      '-p',
      'libs/component/tsconfig.lib.json',
      '--noEmit',
      '--composite',
      'false',
      '--incremental',
      'false',
    ],
  },
  {
    name: 'compiler',
    bin: 'vitest',
    args: [
      'run',
      '--config',
      'libs/compiler/vitest.config.ts',
      '--reporter=json',
      '--outputFile=' + join(lab, 'tests/activation-complete-compiler.json'),
    ],
  },
  {
    name: 'component',
    bin: 'vitest',
    args: [
      'run',
      '--config',
      'libs/component/vitest.config.ts',
      '--reporter=json',
      '--outputFile=' + join(lab, 'tests/activation-complete-component.json'),
    ],
  },
];
const validation = await Promise.all(
  checks.map(async (check) => {
    const executable = join(workspace, 'node_modules/.bin', check.bin);
    try {
      const result = await run(executable, check.args, {
        cwd: root,
        maxBuffer: 8 * 1024 * 1024,
      });
      return { ...check, exitCode: 0, ...result };
    } catch (error) {
      return {
        ...check,
        exitCode: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
      };
    }
  }),
);
const contracts = [];
for (const mode of [
  'reference-runtime',
  'candidate-runtime',
  'candidate-lean',
]) {
  const libraryRoot = mode.startsWith('reference')
    ? join(lab, 'roots/compiler-activation-reference')
    : root;
  const plugin =
    mode === 'candidate-lean'
      ? (
          await import(
            pathToFileURL(join(root, 'dist/libs/compiler/src/vite.js'))
          )
        ).craftCompiler({ lean: true })
      : undefined;
  const result = await build({
    configFile: false,
    root: join(workspace, 'apps/compiler-benchmark'),
    logLevel: 'error',
    plugins: plugin ? [plugin] : [],
    resolve: {
      alias: [
        {
          find: '@craft-ts/component/compiler-runtime',
          replacement: join(
            libraryRoot,
            'libs/component/src/compiler-runtime.ts',
          ),
        },
        ...['component', 'core', 'style'].map((name) => ({
          find: '@craft-ts/' + name,
          replacement: join(libraryRoot, 'libs', name, 'src/index.ts'),
        })),
      ],
    },
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      rolldownOptions: {
        input: join(workspace, 'apps/compiler-benchmark/index.html'),
      },
    },
  });
  const chunks = result.output.filter((item) => item.type === 'chunk');
  const code = chunks.map((chunk) => chunk.code).join('\n');
  const names = [
    'CompiledComponentRenderedNode',
    'LeanComponentRenderedNode',
    'compiledTemplateFor',
    'createCompiledNodes',
    'leanReadScope',
  ];
  const presence = Object.fromEntries(
    names.map((name) => [name, code.includes(name)]),
  );
  const modules = chunks.flatMap((chunk) => chunk.moduleIds);
  const expected = mode !== 'candidate-runtime';
  for (const present of Object.values(presence))
    assert.equal(present, expected, mode + ': compiler support');
  assert(
    !modules.some((name) => name.includes('/libs/compiler/src/')),
    mode + ': no build compiler in browser',
  );
  contracts.push({
    mode,
    presence,
    codeSha256: createHash('sha256').update(code).digest('hex'),
    modules,
    passed: true,
  });
}
await writeFile(
  join(lab, 'tests/activation-complete-validation.json'),
  JSON.stringify({ validation, contracts }, null, 2) + '\n',
);
for (const check of validation)
  assert.equal(check.exitCode, 0, check.stdout + '\n' + check.stderr);
console.log(
  'Typecheck, compiler/component suites and compiler-support tree-shaking contracts passed.',
);
