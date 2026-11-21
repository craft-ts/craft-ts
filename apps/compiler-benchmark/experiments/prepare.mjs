// Isolated performance candidates. Libraries are copied from one committed base;
// the application and the production libraries in the worktree stay unchanged.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, cp, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

export const workspace = resolve(import.meta.dirname, '../../..');
export const lab = join(workspace, 'tmp/performance-campaign');
export const baseCommit = '89f1e46de';
export const baseline = join(lab, 'roots/baseline');
const libraries = [
  'core',
  'component',
  'style',
  'compiler',
  'effect',
  'test-type',
  'stream',
];

export async function prepareBase() {
  await mkdir(baseline, { recursive: true });
  const marker = join(baseline, '.source-commit');
  try {
    assert.equal((await readFile(marker, 'utf8')).trim(), baseCommit);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const archive = execFileSync(
    'git',
    [
      'archive',
      baseCommit,
      ...libraries.map((x) => 'libs/' + x),
      'tsconfig.base.json',
      'tsconfig.json',
      'vitest.config.ts',
      'package.json',
    ],
    { cwd: workspace, maxBuffer: 64 * 1024 * 1024 },
  );
  execFileSync('tar', ['-x', '-C', baseline], { input: archive });
  await normalizeLabConfigs(baseline);
  await writeFile(marker, baseCommit + '\n');
}

// Vite/OXC otherwise follows references to unrelated workspace packages absent
// from this isolated source root. This only removes build graph edges; compiler
// options, aliases and production TypeScript sources remain identical.
export async function normalizeLabConfigs(root) {
  // These sources/config are read by architecture tests, even when the stream
  // package is not imported by a measured application.
  const support = execFileSync(
    'git',
    ['archive', baseCommit, 'libs/stream', 'vitest.config.ts'],
    { cwd: workspace, maxBuffer: 8 * 1024 * 1024 },
  );
  execFileSync('tar', ['-x', '-C', root], { input: support });
  for (const folder of ['', ...libraries.map((x) => 'libs/' + x)]) {
    for (const name of [
      'tsconfig.json',
      'tsconfig.lib.json',
      'tsconfig.spec.json',
    ]) {
      const path = join(root, folder, name);
      let text;
      try {
        text = await readFile(path, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      const parsed = ts.parseConfigFileTextToJson(path, text);
      if (parsed.error) throw Error('Cannot read ' + path);
      if (parsed.config.references) {
        delete parsed.config.references;
        await writeFile(path, JSON.stringify(parsed.config, null, 2) + '\n');
      }
    }
  }
}

export async function prepareCandidate(id, patches = []) {
  assert(/^[a-z][a-z0-9-]*$/.test(id));
  await prepareBase();
  const root = id === 'baseline' ? baseline : join(lab, 'roots', id);
  if (id !== 'baseline') {
    try {
      await stat(join(root, 'candidate.json'));
      throw Error('Candidate already exists: ' + id);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await cp(baseline, root, { recursive: true });
  }
  const changes = [];
  for (const { file, change } of patches) {
    const path = join(root, file),
      before = await readFile(path, 'utf8');
    const after = change(before);
    assert.notEqual(after, before, 'Patch did not change ' + file);
    await writeFile(path, after);
    changes.push({
      file,
      beforeSha256: hash(before),
      afterSha256: hash(after),
      before,
      after,
    });
  }
  await writeFile(
    join(root, 'candidate.json'),
    JSON.stringify({ id, baseCommit, changes }, null, 2) + '\n',
  );
  return root;
}

export function replaceOnce(source, before, after) {
  assert.equal(
    source.split(before).length,
    2,
    'Patch anchor is missing/ambiguous: ' + before.slice(0, 90),
  );
  return source.replace(before, after);
}
function hash(text) {
  return createHash('sha256').update(text).digest('hex');
}

if (process.argv[1] === import.meta.filename) {
  await prepareBase();
  console.log(baseline);
}
