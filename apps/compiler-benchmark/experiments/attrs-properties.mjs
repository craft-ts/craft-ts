import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareCandidate, replaceOnce, lab, workspace } from './prepare.mjs';
import {
  watchedBindCompiler,
  watchedBindTemplate,
  watchedBindRenderer,
} from './watched-bind.mjs';
const foundation = '8e5543797';
const committed = (file) =>
  execFileSync('git', ['show', foundation + ':' + file], {
    cwd: workspace,
    encoding: 'utf8',
  });
function compiler(source) {
  source = replaceOnce(
    source,
    '      if (tags.has(name)) {',
    "      if (tags.has(name) || name==='h') {",
  );
  source = replaceOnce(
    source,
    `        const tag =
          helpers.get(n.expression.text) ?? fail('unknown DOM helper');
        const args = [...n.arguments];`,
    `        const helper=helpers.get(n.expression.text)??fail('unknown DOM helper');
        const args=[...n.arguments];
        const hCall=helper==='h';
        let tag=helper;
        if(hCall){const name=args.shift();if(!name||!ts.isStringLiteral(name)||!tags.has(name.text))fail('h requires a supported literal tag');tag=(name as ts.StringLiteral).text;}
        const argumentCount=args.length;`,
  );
  source = replaceOnce(
    source,
    `          args.length >= 2 &&
          ts.isStringLiteral(args[0]) &&`,
    `          !hCall && args.length >= 2 &&
          ts.isStringLiteral(args[0]) &&`,
  );
  // h and tagHelper pass null as children; the third argument is then ignored.
  // Preserve that generic behavior instead of treating null as an empty props object.
  source = replaceOnce(
    source,
    `        )
          args.shift();
        if (args.length > 1) fail('unsupported tag helper overload');`,
    `        )
          fail('null properties overload requires generic helper semantics');
        if (args.length > 1) fail('unsupported tag helper overload');`,
  );
  source = replaceOnce(
    source,
    `        for (const prop of props?.properties ?? []) {`,
    `        const properties: ts.ObjectLiteralElementLike[]=[];
        let sawAttrs=false;
        for(const property of props?.properties??[]){
          const key=property.name&&(ts.isIdentifier(property.name)||ts.isStringLiteral(property.name))?property.name.text:undefined;
          if(key!=='attrs'){properties.push(property);continue;}
          if(sawAttrs)fail('duplicate attrs property');sawAttrs=true;
          if(!ts.isPropertyAssignment(property))fail('attrs requires an explicit object literal');
          const record=unwrap((property as ts.PropertyAssignment).initializer);
          if(!ts.isObjectLiteralExpression(record))fail('attrs requires an explicit object literal');
          for(const attribute of (record as ts.ObjectLiteralExpression).properties){
            const name=attribute.name&&(ts.isIdentifier(attribute.name)||ts.isStringLiteral(attribute.name))?attribute.name.text:undefined;
            if(!ts.isPropertyAssignment(attribute)||name===undefined||!(['id','title','role','type'].includes(name)||name.startsWith('data-')||name.startsWith('aria-'))||name.startsWith('data-craft-'))fail('unsupported nested attribute');
            properties.push(attribute);
          }
        }
        for (const prop of properties) {`,
  );
  return replaceOnce(
    source,
    '          n.arguments.length === 1 &&',
    '          argumentCount === 1 &&',
  );
}
function sourceFor(id, file) {
  const source = committed(file);
  if (id.startsWith('attrs-final') || id === 'attrs-legacy-runtime') {
    if (file.endsWith('/compiler.ts'))
      return watchedBindCompiler(compiler(source));
    if (id === 'attrs-legacy-runtime') return source;
    if (file.endsWith('/compiled-template.ts'))
      return watchedBindTemplate(source);
    if (file.endsWith('/interpreter.ts')) return watchedBindRenderer(source);
  }
  return id !== 'attrs-reference' && file.endsWith('/compiler.ts')
    ? compiler(source)
    : source;
}
for (const id of [
  'attrs-reference',
  'attrs-properties',
  'attrs-no-lists',
  'attrs-final',
  'attrs-final-no-lists',
  'attrs-legacy-runtime',
]) {
  const root = join(lab, 'roots', id);
  try {
    await access(join(root, 'candidate.json'));
    if (
      process.argv.includes('--refresh-final') &&
      (id.startsWith('attrs-final') || id === 'attrs-legacy-runtime')
    ) {
      const path = join(root, 'candidate.json');
      const candidate = JSON.parse(await readFile(path, 'utf8'));
      for (const change of candidate.changes) {
        const current = await readFile(join(root, change.file), 'utf8');
        assert.equal(
          createHash('sha256').update(current).digest('hex'),
          change.afterSha256,
          'Unrecorded candidate edits: ' + change.file,
        );
        change.after = sourceFor(id, change.file);
        change.afterSha256 = createHash('sha256')
          .update(change.after)
          .digest('hex');
        await writeFile(join(root, change.file), change.after);
      }
      await writeFile(path, JSON.stringify(candidate, null, 2) + '\n');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await prepareCandidate(
      id,
      [
        'libs/compiler/src/compiler.ts',
        'libs/compiler/src/vite.ts',
        'libs/component/src/lib/render/compiled-template.ts',
        'libs/component/src/lib/render/interpreter.ts',
        'libs/core/src/lib/craft-service.ts',
      ].map((file) => ({
        file,
        change: () => sourceFor(id, file),
      })),
    );
  }
  await writeFile(
    join(root, 'libs/compiler/src/import-graph.ts'),
    committed('libs/compiler/src/import-graph.ts'),
  );
  for (const file of execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', foundation, 'libs/compiler/src'],
    { cwd: workspace, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('.spec.ts')))
    await writeFile(join(root, file), committed(file));
  if (id !== 'attrs-reference')
    await writeFile(
      join(root, 'libs/compiler/src/attrs-properties.spec.ts'),
      await readFile(
        new URL('attrs-properties.contracts.ts', import.meta.url),
        'utf8',
      ),
    );
  console.log(root);
}
