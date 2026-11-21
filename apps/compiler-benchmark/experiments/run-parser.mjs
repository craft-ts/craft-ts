// OXC feasibility experiment. It measures a complete JS AST, not just the native
// parser call before lazy AST deserialization. No compiler backend is replaced.
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import ts from 'typescript';
import { parseSync } from 'rolldown/utils';
import { lab, workspace, replaceOnce } from './prepare.mjs';

const output = join(lab, 'parser');
await mkdir(output, { recursive: true });
const worker = process.argv[2] === '--worker';
const median = (values) => {
  const a = [...values].sort((a, b) => a - b);
  return a.length % 2
    ? a[a.length >> 1]
    : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const hash = (text) => createHash('sha256').update(text).digest('hex');
const sourcePath = join(workspace, 'dist/libs/compiler/src/compiler.js');
const original = await readFile(sourcePath, 'utf8');
let instrumented = replaceOnce(
  original,
  '    const ast = ts.createSourceFile(',
  `    const phaseStart=performance.now();
    const ast = ts.createSourceFile(`,
);
instrumented = replaceOnce(
  instrumented,
  '    const output = new MagicString(source);',
  `    const parsedAt=performance.now();
    const output = new MagicString(source);`,
);
instrumented = replaceOnce(
  instrumented,
  '    const checker = ts',
  `    const checkerStart=performance.now();
    const checker = ts`,
);
instrumented = replaceOnce(
  instrumented,
  '    const sameBinding =',
  `    const checkedAt=performance.now();
    const sameBinding =`,
);
instrumented = replaceOnce(
  instrumented,
  `    return {
        code: output.toString(),
        map: output.generateMap({
            source: filename,
            includeContent: true,
            hires: true,
        }),`,
  `    const analyzedAt=performance.now();
    const codeResult=output.toString();
    const emittedAt=performance.now();
    const mapResult=output.generateMap({source:filename,includeContent:true,hires:true});
    const finishedAt=performance.now();
    stageSamples.push({filename,parse:parsedAt-phaseStart,frontMatter:checkerStart-parsedAt,checker:checkedAt-checkerStart,analysis:analyzedAt-checkedAt,code:emittedAt-analyzedAt,map:finishedAt-emittedAt,total:finishedAt-phaseStart});
    return {
        code: codeResult,
        map: mapResult,`,
);
instrumented =
  instrumented.replace(/\/\/# sourceMappingURL=.*$/m, '') +
  '\nexport const stageSamples=[];\n';
const stagedPath = join(output, 'compiler-stages.mjs');
const zeroPath = join(output, 'compiler-zero-parser.mjs');
const zeroSource =
  replaceOnce(
    original,
    '    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);',
    '    const ast = preparedAST;',
  ).replace(/\/\/# sourceMappingURL=.*$/m, '') +
  '\nlet preparedAST; export function installPreparedAST(ast){preparedAST=ast;}\n';
if (!worker) {
  await writeFile(stagedPath, instrumented);
  await writeFile(zeroPath, zeroSource);
}
const normal = await import(pathToFileURL(sourcePath));
const staged = await import(pathToFileURL(stagedPath));
const zero = await import(pathToFileURL(zeroPath));
const files = (
  await readdir(join(workspace, 'apps/framework-benchmark/src/craft-page'))
)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => 'apps/framework-benchmark/src/craft-page/' + file);
files.push('apps/compiler-benchmark/main.ts');
const corpus = [];
for (const file of files) {
  const source = await readFile(join(workspace, file), 'utf8');
  corpus.push({ file, source });
}
// Additional syntax/binding counterexamples must parse and preserve statements.
const syntax = [
  `import {craftComponent,div} from '@craft-ts/component'; const C=craftComponent('C',{},()=>div('✅ é 🧩'));`,
  `import {div} from '@craft-ts/component'; function f(){if(false){var div=other;}return div('x');}`,
  `const before=make(); const Row=()=>null; function make(){return ()=>Row();}`,
  `const value={get x(){return 1;}}; const {x:renamed}=value; type T={readonly a?:string};`,
];
function parseTS(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}
function parseOXC(file, source) {
  const result = parseSync(file, source, { lang: 'ts', preserveParens: true });
  assert.equal(result.errors.length, 0, file + ' OXC parse');
  return result.program;
}
const contracts = [];
for (const { file, source } of [
  ...corpus,
  ...syntax.map((source, index) => ({
    file: 'syntax-' + index + '.ts',
    source,
  })),
]) {
  const a = parseTS(file, source),
    b = parseOXC(file, source);
  assert.equal(a.parseDiagnostics.length, 0, file + ' TS parse');
  assert.equal(b.type, 'Program');
  assert.equal(b.body.length, a.statements.length, file + ' statement count');
  assert.equal(
    b.body[0].start,
    a.statements[0].getStart(a),
    file + ' UTF-16 offset',
  );
  assert.equal(
    b.body.at(-1).end,
    a.statements.at(-1).end,
    file + ' UTF-16 end offset',
  );
  contracts.push({ file, statements: a.statements.length, passed: true });
  const before = normal.compileModule(source, file, { lean: true }),
    after = staged.compileModule(source, file, { lean: true });
  assert.equal(after.code, before.code);
  assert.deepEqual(after.components, before.components);
  assert.deepEqual(after.map, before.map);
  zero.installPreparedAST(parseTS(file, source));
  const free = zero.compileModule(source, file, { lean: true });
  assert.equal(free.code, before.code);
  assert.deepEqual(free.map, before.map);
}
let incompatibleOxcAST;
try {
  zero.installPreparedAST(parseOXC(corpus[0].file, corpus[0].source));
  zero.compileModule(corpus[0].source, corpus[0].file, { lean: true });
} catch (error) {
  incompatibleOxcAST = { expectedFailure: true, message: error.message };
}
assert(
  incompatibleOxcAST,
  'OXC AST cannot stand in for a TypeScript SourceFile',
);
if (worker) {
  let sink = 0;
  const variants = {
    'typescript-parse': () => {
      for (const { file, source } of corpus)
        sink += parseTS(file, source).statements.length;
    },
    'oxc-parse-with-js-ast': () => {
      for (const { file, source } of corpus)
        sink += parseOXC(file, source).body.length;
    },
    'full-compiler': () => {
      for (const { file, source } of corpus)
        sink += normal.compileModule(source, file, { lean: true }).code.length;
    },
    'zero-parser-ceiling': () => {
      let duration = 0;
      for (const { file, source } of corpus) {
        // Fresh AST, allocated outside the measured interval. Symbol binding and
        // all analysis/emission remain inside it; no AST or symbol cache is reused.
        zero.installPreparedAST(parseTS(file, source));
        const start = performance.now();
        sink += zero.compileModule(source, file, { lean: true }).code.length;
        duration += performance.now() - start;
      }
      return duration;
    },
  };
  const raw = {};
  for (const fn of Object.values(variants))
    for (let warm = 0; warm < 5; warm++) fn();
  let seed = Number(process.argv[3]) + 17112026;
  for (let loop = 0; loop < 35; loop++) {
    const order = Object.keys(variants);
    for (let i = order.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = Math.floor((seed / 2 ** 32) * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const name of order) {
      const start = performance.now();
      const duration = variants[name]();
      (raw[name] ??= []).push(duration ?? performance.now() - start);
    }
  }
  staged.stageSamples.length = 0;
  for (let loop = 0; loop < 10; loop++)
    for (const { file, source } of corpus)
      staged.compileModule(source, file, { lean: true });
  const phaseTotals = [];
  for (let loop = 0; loop < 10; loop++) {
    const values = staged.stageSamples.slice(
      loop * corpus.length,
      (loop + 1) * corpus.length,
    );
    phaseTotals.push(
      Object.fromEntries(
        [
          'parse',
          'frontMatter',
          'checker',
          'analysis',
          'code',
          'map',
          'total',
        ].map((key) => [
          key,
          values.reduce((sum, value) => sum + value[key], 0),
        ]),
      ),
    );
  }
  await writeFile(
    join(output, 'worker-' + process.argv[3] + '.json'),
    JSON.stringify(
      {
        sink,
        raw,
        median: Object.fromEntries(
          Object.entries(raw).map(([key, values]) => [key, median(values)]),
        ),
        phaseTotals,
        contracts,
        incompatibleOxcAST,
      },
      null,
      2,
    ) + '\n',
  );
} else {
  const raw = [];
  for (let run = 0; run < 7; run++) {
    const child = spawnSync(
      process.execPath,
      [import.meta.filename, '--worker', String(run)],
      { cwd: workspace, encoding: 'utf8' },
    );
    assert.equal(child.status, 0, child.stdout + '\n' + child.stderr);
    raw.push(
      JSON.parse(
        await readFile(join(output, 'worker-' + run + '.json'), 'utf8'),
      ),
    );
    console.log(run + 1 + '/7 parser/compiler processes');
  }
  const summary = Object.fromEntries(
    Object.keys(raw[0].median).map((key) => [
      key,
      median(raw.map((row) => row.median[key])),
    ]),
  );
  const phases = Object.fromEntries(
    ['parse', 'frontMatter', 'checker', 'analysis', 'code', 'map', 'total'].map(
      (key) => [
        key,
        median(
          raw.flatMap((row) => row.phaseTotals.map((value) => value[key])),
        ),
      ],
    ),
  );
  const version = async (name) =>
    JSON.parse(
      await readFile(
        join(workspace, 'node_modules', name, 'package.json'),
        'utf8',
      ),
    ).version;
  const result = {
    schemaVersion: 1,
    sourceCommit: 'cd3d220e9',
    environment: {
      node: process.version,
      cpu: cpus()[0].model,
      typescript: await version('typescript'),
      rolldown: await version('rolldown'),
    },
    corpus: corpus.map(({ file, source }) => ({
      file,
      bytes: Buffer.byteLength(source),
      sha256: hash(source),
    })),
    compiledJsSha256: hash(original),
    instrumentedJsSha256: hash(instrumented),
    instrumentationSource: instrumented,
    zeroParserSource: zeroSource,
    contracts,
    incompatibleOxcAST,
    summary,
    phases,
    raw,
    decision:
      'Feasibility measurement only: OXC AST does not replace TypeScript syntax nodes or its lexical symbol checker. The zero-parser control is a hypothetical ceiling, with fresh TypeScript AST construction excluded from its timer. No compiler backend change is enabled.',
  };
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.table(summary);
  console.table(phases);
}
