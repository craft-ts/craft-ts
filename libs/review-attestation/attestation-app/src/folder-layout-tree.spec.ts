import { describe, expect, it } from 'vitest';
import type { FolderLayoutEntry } from '@craft-ts/dev-tools/attestation-review';
import {
  ancestorFolderIds,
  commonDirectory,
  folderId,
  folderLayoutTrees,
  linksUnder,
  visibleRows,
} from './folder-layout-tree';

const entry = (
  sourcePath: string | null,
  proposedPath: string | null,
  status: FolderLayoutEntry['status'] = 'moved',
): FolderLayoutEntry => ({ sourcePath, proposedPath, status, reasons: [] });

describe('folder layout trees', () => {
  it('shares the directory prefix common to both sides', () => {
    expect(
      commonDirectory([
        'apps/demo/src/app/a.ts',
        'apps/demo/src/features/b.ts',
      ]),
    ).toBe('apps/demo/src/');
    expect(commonDirectory(['a.ts', 'src/b.ts'])).toBe('');
  });

  it('nests files under compacted folders, folders first', () => {
    const { root, source } = folderLayoutTrees([
      entry('src/app/examples/craft/query.ts', 'src/features/query.ts'),
      entry('src/app/main.ts', 'src/app/main.ts', 'unchanged'),
    ]);

    expect(root).toBe('src/');
    expect(source.map((row) => [row.kind, row.name, row.depth])).toEqual([
      ['folder', 'app', 0],
      ['folder', 'examples/craft', 1],
      ['file', 'query.ts', 2],
      ['file', 'main.ts', 1],
    ]);
    expect(source[0].changes).toBe(1);
  });

  it('keeps colliding destinations as distinct, flagged rows', () => {
    const trees = folderLayoutTrees([
      entry('src/a/api.service.ts', 'src/shared/api.service.ts'),
      entry('src/b/api.service.ts', 'src/shared/api.service.ts'),
    ]);
    const files = trees.proposed.filter((row) => row.kind === 'file');

    expect(trees.collisions).toBe(1);
    expect(new Set(trees.proposed.map((row) => row.key)).size).toBe(
      trees.proposed.length,
    );
    expect(files.map((row) => [row.collisions, row.counterpart])).toEqual([
      [2, 'src/a/api.service.ts'],
      [2, 'src/b/api.service.ts'],
    ]);
  });

  it('links the two rows of one entry and leaves one-sided entries alone', () => {
    const { source, proposed } = folderLayoutTrees([
      entry('src/old.ts', 'src/new/old.ts'),
      entry('src/gone.ts', null, 'deleted'),
      entry(null, 'src/new/born.ts', 'created'),
    ]);
    const link = (rows: typeof source, name: string) =>
      rows.find((row) => row.name === name)?.link;

    expect(link(source, 'old.ts')).toBe(link(proposed, 'old.ts'));
    expect(link(proposed, 'gone.ts')).toBeUndefined();
    expect(link(source, 'born.ts')).toBeUndefined();
  });

  it('keeps an unchanged file without destination in place in the proposed tree', () => {
    const trees = folderLayoutTrees([
      entry('src/main.ts', null, 'unchanged'),
      entry('src/app/app.ts', 'src/core/app.ts'),
      entry('src/app/other.ts', 'src/main.ts'),
    ]);
    const main = trees.proposed.filter((row) => row.name === 'main.ts');

    expect(main.map((row) => [row.status, row.path, row.counterpart])).toEqual([
      ['unchanged', 'src/main.ts', 'src/main.ts'],
      ['moved', 'src/main.ts', 'src/app/other.ts'],
    ]);
    // A move onto a file left in place is a collision.
    expect(trees.collisions).toBe(1);
  });
});

describe('collapsed folders', () => {
  const { source } = folderLayoutTrees([
    entry('src/a/deep/one.ts', 'src/x/one.ts'),
    entry('src/a/two.ts', 'src/x/two.ts'),
    entry('src/b/three.ts', 'src/x/three.ts'),
  ]);
  const folder = (name: string) =>
    folderId('source', source.find((row) => row.name === name)!);

  it('hides everything below a collapsed folder, and nothing else', () => {
    const rows = visibleRows(source, 'source', [folder('a')]);

    expect(rows.map((row) => [row.name, row.collapsed])).toEqual([
      ['a', true],
      ['b', false],
      ['three.ts', false],
    ]);
  });

  it('folds each side independently', () => {
    expect(visibleRows(source, 'proposed', [folder('a')])).toHaveLength(
      source.length,
    );
  });
});

describe('locating across trees', () => {
  const { source, proposed } = folderLayoutTrees([
    entry('src/a/deep/one.ts', 'src/x/y/one.ts'),
    entry('src/a/two.ts', 'src/z/two.ts'),
    entry('src/b/three.ts', 'src/x/three.ts'),
  ]);
  const row = (rows: typeof source, name: string) =>
    rows.find((candidate) => candidate.name === name)!;

  it('collects the files below a folder, or the file itself', () => {
    expect(linksUnder(source, row(source, 'a'))).toEqual(['0', '1']);
    expect(linksUnder(source, row(source, 'three.ts'))).toEqual(['2']);
  });

  it('names the folders to unfold in the other tree', () => {
    expect(ancestorFolderIds(proposed, 'proposed', ['0'])).toEqual([
      folderId('proposed', row(proposed, 'x')),
      folderId('proposed', row(proposed, 'y')),
    ]);
  });
});
