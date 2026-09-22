import {
  craftComponent,
  div,
  forNode,
  li,
  p,
  section,
  small,
  span,
  strong,
  ul,
  type Input,
} from '@craft-ts/component';
import type { FolderLayoutEntry } from '@craft-ts/dev-tools/attestation-review';

const pathOf = (entry: FolderLayoutEntry, side: 'source' | 'proposed') =>
  side === 'source' ? entry.sourcePath : entry.proposedPath;

const labelOf = (path: string): string => path.split('/').at(-1) ?? path;
const depthOf = (path: string): number =>
  Math.max(0, path.split('/').length - 1);
const statusLabel = (status: FolderLayoutEntry['status']): string =>
  status === 'moved'
    ? 'moved'
    : status === 'deleted'
      ? 'deleted'
      : status === 'created'
        ? 'created'
        : 'unchanged';

export const FolderLayoutView = craftComponent(
  'FolderLayoutView',
  {},
  (
    entries: Input<readonly FolderLayoutEntry[]>,
    sourceGraphHash: Input<string>,
    configHash: Input<string>,
    moves: Input<number>,
    reviews: Input<number>,
  ) => ({ entries, sourceGraphHash, configHash, moves, reviews }),
  ({ entries, sourceGraphHash, configHash, moves, reviews }) =>
    section({ class: 'folder-layout-view' }, [
      div({ class: 'folder-layout-summary' }, [
        strong('Folder layout proposal'),
        small(function* () {
          return `${(yield* entries()).length} files · ${yield* moves()} moves · ${yield* reviews()} reviews`;
        }),
      ]),
      div({ class: 'folder-layout-legend', 'aria-label': 'Change legend' }, [
        span({ class: ['folder-layout-legend-item', 'moved'] }, 'Moved'),
        span({ class: ['folder-layout-legend-item', 'deleted'] }, 'Deleted'),
        span({ class: ['folder-layout-legend-item', 'created'] }, 'Created'),
        span(
          { class: ['folder-layout-legend-item', 'unchanged'] },
          'Unchanged',
        ),
      ]),
      div({ class: 'folder-layout-trees' }, [
        tree('Original organisation', entries, 'source'),
        tree('Proposed organisation', entries, 'proposed'),
      ]),
      p({ class: 'folder-layout-hash code' }, function* () {
        return `Graph ${yield* sourceGraphHash()} · configuration ${yield* configHash()}`;
      }),
    ]),
);

function tree(
  title: string,
  entries: Input<readonly FolderLayoutEntry[]>,
  side: 'source' | 'proposed',
) {
  return div({ class: 'folder-layout-tree' }, [
    div({ class: 'folder-layout-tree-heading' }, [strong(title)]),
    ul(
      { class: 'folder-layout-tree-list' },
      forNode(
        entries,
        { track: (entry) => `${side}:${pathOf(entry, side) ?? ''}` },
        (entry) =>
          li(
            {
              hidden: function* () {
                return pathOf(yield* entry(), side) === null;
              },
              class: function* () {
                return ['folder-layout-row', (yield* entry()).status];
              },
              style: function* () {
                const path = pathOf(yield* entry(), side) ?? '';
                return `--tree-depth:${depthOf(path)}`;
              },
              title: function* () {
                return pathOf(yield* entry(), side) ?? '';
              },
            },
            [
              span(
                { class: 'folder-layout-row-icon', 'aria-hidden': 'true' },
                '·',
              ),
              span({ class: 'folder-layout-row-label' }, function* () {
                return labelOf(pathOf(yield* entry(), side) ?? '');
              }),
              small({ class: 'folder-layout-row-status' }, function* () {
                return statusLabel((yield* entry()).status);
              }),
            ],
          ),
      ),
    ),
  ]);
}
