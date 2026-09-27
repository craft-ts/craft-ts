import type { FolderLayoutEntry } from '@craft-ts/dev-tools/attestation-review';

export type FolderLayoutSide = 'source' | 'proposed';

/** One visible line of a folder tree: a folder, or a file that links across. */
export interface FolderLayoutRow {
  /** Unique within one side; safe as a `forNode` key. */
  readonly key: string;
  readonly kind: 'folder' | 'file';
  /** Folder chains with a single child are compacted: `app/examples/craft`. */
  readonly name: string;
  readonly depth: number;
  readonly status: FolderLayoutEntry['status'] | 'folder';
  /** Shared by the two rows of one entry, so hovering one finds the other. */
  readonly link: string;
  /** The full path on this side, for the tooltip. */
  readonly path: string;
  /** Where the file lives on the other side, or `null` when it does not. */
  readonly counterpart: string | null;
  /** How many sources share this destination (`> 1` is a collision). */
  readonly collisions: number;
  /** Files inside a folder that are not unchanged. */
  readonly changes: number;
}

export interface FolderLayoutTrees {
  /** Directory prefix shared by every path, both sides, shown once. */
  readonly root: string;
  readonly source: readonly FolderLayoutRow[];
  readonly proposed: readonly FolderLayoutRow[];
  /** Destinations claimed by more than one source. */
  readonly collisions: number;
}

interface FolderNode {
  readonly folders: Map<string, FolderNode>;
  readonly files: { readonly name: string; readonly index: number }[];
}

/**
 * Where the entry sits on one side. An unchanged file stays where it is, so it
 * is part of the proposed tree too, even without a proposed path.
 */
const pathOf = (entry: FolderLayoutEntry, side: FolderLayoutSide) =>
  side === 'source'
    ? entry.sourcePath
    : entry.status === 'unchanged'
      ? (entry.proposedPath ?? entry.sourcePath)
      : entry.proposedPath;

const otherSide = (side: FolderLayoutSide): FolderLayoutSide =>
  side === 'source' ? 'proposed' : 'source';

const byName = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

/** The longest directory prefix (ending in `/`) shared by every path. */
export function commonDirectory(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  const directories = paths.map((path) => path.split('/').slice(0, -1));
  const shared: string[] = [];
  for (let index = 0; ; index += 1) {
    const segment = directories[0][index];
    if (
      segment === undefined ||
      directories.some((parts) => parts[index] !== segment)
    ) {
      break;
    }
    shared.push(segment);
  }
  return shared.length ? `${shared.join('/')}/` : '';
}

export function folderLayoutTrees(
  entries: readonly FolderLayoutEntry[],
): FolderLayoutTrees {
  const paths = entries.flatMap((entry) =>
    [pathOf(entry, 'source'), pathOf(entry, 'proposed')].filter(
      (path): path is string => path !== null,
    ),
  );
  const root = commonDirectory(paths);

  const claims = new Map<string, number>();
  entries.forEach((entry) => {
    // A file left in place still occupies its path: a move onto it collides.
    const destination = pathOf(entry, 'proposed');
    if (destination === null) return;
    claims.set(destination, (claims.get(destination) ?? 0) + 1);
  });
  const collisions = [...claims.values()].filter((count) => count > 1).length;

  return {
    root,
    source: sideRows(entries, 'source', root, claims),
    proposed: sideRows(entries, 'proposed', root, claims),
    collisions,
  };
}

function sideRows(
  entries: readonly FolderLayoutEntry[],
  side: FolderLayoutSide,
  root: string,
  claims: ReadonlyMap<string, number>,
): FolderLayoutRow[] {
  const tree: FolderNode = { folders: new Map(), files: [] };
  entries.forEach((entry, index) => {
    const path = pathOf(entry, side);
    if (path === null) return;
    const segments = path.slice(root.length).split('/');
    const name = segments.pop() ?? path;
    let node = tree;
    for (const segment of segments) {
      let next = node.folders.get(segment);
      if (!next) {
        next = { folders: new Map(), files: [] };
        node.folders.set(segment, next);
      }
      node = next;
    }
    node.files.push({ name, index });
  });

  const rows: FolderLayoutRow[] = [];
  const changesIn = (node: FolderNode): number =>
    node.files.filter(({ index }) => entries[index].status !== 'unchanged')
      .length +
    [...node.folders.values()].reduce(
      (total, child) => total + changesIn(child),
      0,
    );

  const visit = (node: FolderNode, prefix: string, depth: number) => {
    [...node.folders.entries()]
      .sort(([left], [right]) => byName(left, right))
      .forEach(([segment, child]) => {
        // Compact `a/b/c` while each folder holds exactly one folder.
        let name = segment;
        let folder = child;
        while (folder.files.length === 0 && folder.folders.size === 1) {
          const [[nextName, nextFolder]] = [...folder.folders.entries()];
          name = `${name}/${nextName}`;
          folder = nextFolder;
        }
        const path = `${prefix}${name}`;
        rows.push({
          key: `folder:${path}`,
          kind: 'folder',
          name,
          depth,
          status: 'folder',
          link: '',
          path: `${root}${path}/`,
          counterpart: null,
          collisions: 0,
          changes: changesIn(folder),
        });
        visit(folder, `${path}/`, depth + 1);
      });

    [...node.files]
      .sort((left, right) => byName(left.name, right.name))
      .forEach(({ name, index }) => {
        const entry = entries[index];
        rows.push({
          key: `file:${index}`,
          kind: 'file',
          name,
          depth,
          status: entry.status,
          link: String(index),
          path: pathOf(entry, side) ?? '',
          counterpart: pathOf(entry, otherSide(side)),
          collisions: (() => {
            const destination = pathOf(entry, 'proposed');
            return destination === null ? 0 : (claims.get(destination) ?? 0);
          })(),
          changes: 0,
        });
      });
  };

  visit(tree, '', 0);
  return rows;
}

/** A row as shown: whether its folder is folded is part of what is drawn. */
export interface VisibleFolderLayoutRow extends FolderLayoutRow {
  readonly collapsed: boolean;
}

/** Id of a folder in the collapsed set; the two trees fold independently. */
export const folderId = (side: FolderLayoutSide, row: FolderLayoutRow) =>
  `${side}|${row.key}`;

/** Drops every row below a collapsed folder (rows are in depth-first order). */
export function visibleRows(
  rows: readonly FolderLayoutRow[],
  side: FolderLayoutSide,
  collapsed: readonly string[],
): VisibleFolderLayoutRow[] {
  const folded = new Set(collapsed);
  const visible: VisibleFolderLayoutRow[] = [];
  let hiddenBelow = Infinity;
  for (const row of rows) {
    if (row.depth > hiddenBelow) continue;
    hiddenBelow = Infinity;
    const isCollapsed =
      row.kind === 'folder' && folded.has(folderId(side, row));
    if (isCollapsed) hiddenBelow = row.depth;
    visible.push({ ...row, collapsed: isCollapsed });
  }
  return visible;
}

export const otherFolderLayoutSide = otherSide;

/** Links of the row itself (a file) or of every file below it (a folder). */
export function linksUnder(
  rows: readonly FolderLayoutRow[],
  row: FolderLayoutRow,
): string[] {
  if (row.kind === 'file') return [row.link];
  const start = rows.findIndex((candidate) => candidate.key === row.key);
  const links: string[] = [];
  for (let index = start + 1; index < rows.length; index += 1) {
    const candidate = rows[index];
    if (candidate.depth <= row.depth) break;
    if (candidate.kind === 'file') links.push(candidate.link);
  }
  return links;
}

/** Folder ids that must be unfolded for rows with these links to show. */
export function ancestorFolderIds(
  rows: readonly FolderLayoutRow[],
  side: FolderLayoutSide,
  links: readonly string[],
): string[] {
  const wanted = new Set(links);
  const ancestors = new Set<string>();
  const stack: FolderLayoutRow[] = [];
  for (const row of rows) {
    while (stack.length && stack[stack.length - 1].depth >= row.depth) {
      stack.pop();
    }
    if (row.kind === 'folder') {
      stack.push(row);
    } else if (wanted.has(row.link)) {
      stack.forEach((folder) => ancestors.add(folderId(side, folder)));
    }
  }
  return [...ancestors];
}
