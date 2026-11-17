import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { lab, workspace } from './prepare.mjs';
const oldRoot =
  process.env.LEGACY_COMPILER_ROOT ??
  join(dirname(workspace), 'craft-ts-compiler');
const oldTmp = join(oldRoot, 'tmp'),
  frozen = join(oldTmp, 'frozen/nolist'),
  output = join(lab, 'legacy-compiler');
await mkdir(output, { recursive: true });
const hash = (source) => createHash('sha256').update(source).digest('hex');
const git = (file) =>
  execFileSync('git', ['show', '7d2c8f75b:' + file], {
    cwd: workspace,
    encoding: 'utf8',
  });
const raw = {};
for (const file of [
  'lean-3/results.json',
  'final-rows/results.json',
  'page-lean-2/report.json',
  'final-page-2/report.json',
])
  raw[file] = JSON.parse(await readFile(join(oldTmp, file), 'utf8'));
const lean = raw['lean-3/results.json'];
const frozenInterpreter = await readFile(
  join(frozen, 'libs/component/src/lib/render/interpreter.ts'),
  'utf8',
);
assert.equal(
  hash(frozenInterpreter),
  lean.builds.nolist.runtimeSha256[
    'libs/component/src/lib/render/interpreter.ts'
  ],
);
const originalInterpreter = frozenInterpreter.replace(
  '  private leanItems(): boolean {\n    return false;',
  '  private leanItems(): boolean {',
);
assert.equal(
  hash(originalInterpreter),
  lean.sourceSha256['libs/component/src/lib/render/interpreter.ts'],
);
const inventory = JSON.parse(
  execFileSync(
    'python3',
    [
      '-c',
      `import subprocess,tarfile,io,pathlib,hashlib,json
root=pathlib.Path(${JSON.stringify(frozen)})
archive=subprocess.check_output(['git','archive','7d2c8f75b','libs/core','libs/component','libs/style'])
checked=0;changed=[];missing=[]
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
 for member in tar:
  name=member.name
  if not member.isfile() or not name.endswith('.ts') or name.endswith(('.spec.ts','.spec-d.ts','.d.ts')) or '/src/' not in name:continue
  file=root/name
  if not file.exists():missing.append(name);continue
  actual=file.read_bytes();expected=tar.extractfile(member).read();checked+=1
  if actual!=expected:changed.append({'file':name,'frozenSha256':hashlib.sha256(actual).hexdigest()})
print(json.dumps({'checked':checked,'changed':changed,'missing':missing}))`,
    ],
    { cwd: workspace, encoding: 'utf8' },
  ),
);
assert.equal(inventory.checked, 324);
assert.equal(inventory.missing.length, 0);
const jsShape = (source) => {
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
    },
  }).outputText;
  const ast = ts.createSourceFile(
    'comparison.js',
    js,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const shape = (node) => {
    const children = [];
    ts.forEachChild(node, (child) => {
      children.push(shape(child));
    });
    return {
      kind: node.kind,
      flags: node.flags,
      text:
        ts.isIdentifier(node) ||
        ts.isPrivateIdentifier(node) ||
        ts.isLiteralExpression(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
          ? node.text
          : undefined,
      operator: 'operator' in node ? node.operator : undefined,
      keywordToken: 'keywordToken' in node ? node.keywordToken : undefined,
      token: 'token' in node ? node.token : undefined,
      children,
    };
  };
  return hash(JSON.stringify(shape(ast)));
};
const patches = [];
for (const item of inventory.changed) {
  const before = git(item.file),
    after = await readFile(join(frozen, item.file), 'utf8');
  const previous = join(output, 'git-7d', item.file);
  await mkdir(dirname(previous), { recursive: true });
  await writeFile(previous, before);
  const diff = spawnSync(
    'git',
    ['diff', '--no-index', '--', previous, join(frozen, item.file)],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(diff.status, 1);
  patches.push({
    ...item,
    comparisonCommit: '7d2c8f75b',
    beforeSha256: hash(before),
    emittedJsShapeMatches: jsShape(before) === jsShape(after),
    patch: diff.stdout,
  });
}
const originalFile = join(output, 'original-interpreter.ts');
await writeFile(originalFile, originalInterpreter);
const patch = spawnSync(
  'git',
  [
    'diff',
    '--no-index',
    '--',
    originalFile,
    join(frozen, 'libs/component/src/lib/render/interpreter.ts'),
  ],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
assert.equal(patch.status, 1);
const result = {
  createdAt: new Date().toISOString(),
  raw,
  inventory,
  patches,
  recoveredRuntime: {
    originalSha256: hash(originalInterpreter),
    nolistSha256: hash(frozenInterpreter),
    patch: patch.stdout,
  },
  limitations: [
    'The historical nolist label leaves compiler lists:true. Its runtime adds return false to leanItems; this exact frozen file and the reconstructed original match the recorded SHA256 values.',
    'Against commit 7d2c8f75b, 321 of 324 frozen runtime source files are byte-identical. The other three are archived as patches with emitted JavaScript AST comparisons; the interpreter also contains real earlier implementation changes.',
    'The historical compiler source SHA256 c8da7c8c2fc223494d7c10b9cb4010c53444d3c7c2c0460809121c6ea88e9c53 is recorded but its exact TypeScript file is not recovered. Do not claim a complete reconstruction of the old build.',
    'page-lean-2 has no saved equivalence or compiler-option metadata. It remains an unverified historical screen; fresh controlled measurements supersede its attribution.',
    'Compiled versus lean-without-light-entries changes several mechanisms together, including generator lowering. The old 42.4 to 23.8ms difference is not an isolated component-owner measurement.',
  ],
};
await writeFile(
  join(output, 'audit.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    checked: inventory.checked,
    changed: patches.map((item) => [item.file, item.emittedJsShapeMatches]),
    originalRuntimeMatches: true,
  }),
);
