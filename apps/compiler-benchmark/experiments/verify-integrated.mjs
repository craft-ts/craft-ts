import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { lab, workspace } from './prepare.mjs';
const integrated = await import(
  pathToFileURL(join(workspace, 'dist/libs/compiler/src/compiler.js'))
);
const measured = await import(
  pathToFileURL(
    join(lab, 'roots/local-lists/dist/libs/compiler/src/compiler.js'),
  )
);
async function files(directory) {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) =>
        entry.isDirectory()
          ? files(join(directory, entry.name))
          : [join(directory, entry.name)],
      ),
    )
  ).flat();
}
const sources = (
  await files(join(workspace, 'apps/framework-benchmark/src/craft-page'))
).filter((file) => file.endsWith('.ts'));
sources.push(join(workspace, 'apps/compiler-benchmark/main.ts'));
const results = [];
for (const file of sources) {
  let source = await readFile(file, 'utf8');
  if (file.endsWith('compiler-benchmark/main.ts'))
    source = source
      .replace(
        'const Row = craftComponent(',
        'function fixture() {\nconst Row = craftComponent(',
      )
      .replace(
        'const start = performance.now();',
        'return App; }\nconst App = fixture();\nconst start = performance.now();',
      );
  const before = measured.compileModule(source, file, { lean: true }),
    after = integrated.compileModule(source, file, { lean: true });
  assert.equal(after.code, before.code, file + ' generated code');
  assert.equal(
    after.optimizedLists,
    before.optimizedLists,
    file + ' optimized lists',
  );
  results.push({
    file,
    generatedCodeSha256: createHash('sha256').update(after.code).digest('hex'),
    optimizedLists: after.optimizedLists,
    passed: true,
  });
}
await writeFile(
  join(lab, 'tests/integrated-output.json'),
  JSON.stringify({ passed: true, results }, null, 2) + '\n',
);
console.log(
  results.length +
    ' integrated compiler outputs match measured candidate byte for byte.',
);
