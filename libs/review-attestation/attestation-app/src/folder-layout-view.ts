import {
  button,
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
  withComponentProviders,
  type Input,
} from '@craft-ts/component';
import {
  craftComputed,
  craftMethod,
  state,
  craftUse,
  craftService,
  craftPrivate,
  craftExpose,
} from '@craft-ts/core';
import type { FolderLayoutEntry } from '@craft-ts/dev-tools/attestation-review';
import {
  highlightFolderLayoutRow,
  locateFolderLayoutRows,
} from './browser-adapter';
import {
  ancestorFolderIds,
  folderId,
  folderLayoutTrees,
  linksUnder,
  otherFolderLayoutSide,
  visibleRows,
  type FolderLayoutRow,
  type FolderLayoutTrees,
  type FolderLayoutSide,
  type VisibleFolderLayoutRow,
} from './folder-layout-tree';
import { folderLayout, TREE_INDENT_PX, treeVars } from './folder-layout.style';
import { assign, unit } from '@craft-ts/style';

const statusLabel = (row: FolderLayoutRow): string =>
  row.kind === 'folder'
    ? row.changes
      ? `${row.changes} changed`
      : ''
    : row.status === 'deleted' || row.status === 'created'
      ? row.status
      : '';

const iconOf = (row: VisibleFolderLayoutRow): string =>
  row.kind === 'folder'
    ? row.collapsed
      ? '▸'
      : '▾'
    : row.status === 'deleted'
      ? '−'
      : row.status === 'created'
        ? '+'
        : row.status === 'moved'
          ? '→'
          : '·';

const titleOf = (row: FolderLayoutRow, side: FolderLayoutSide): string => {
  if (row.kind === 'folder') return row.path;
  const counterpart =
    row.counterpart === null
      ? side === 'source'
        ? 'removed from the proposal'
        : 'new in the proposal'
      : `${side === 'source' ? 'moves to' : 'comes from'} ${row.counterpart}`;
  const collision =
    row.collisions > 1
      ? `\n⚠ ${row.collisions} files are proposed at this same path`
      : '';
  return `${row.path}\n${counterpart}${collision}`;
};

const noCollapsedFolders = (): readonly string[] => [];
const withoutSide = (ids: readonly string[], side: FolderLayoutSide) =>
  ids.filter((id) => !id.startsWith(`${side}|`));

export const { FolderLayoutViewState, provideFolderLayoutViewState } =
  craftService(
    { name: 'folderLayoutViewState', providedIn: 'toProvide' },
    function* (serviceInputs: {
      readonly $provided: {
        readonly entries: Input<readonly FolderLayoutEntry[]>;
        readonly sourceGraphHash: Input<string>;
        readonly configHash: Input<string>;
        readonly moves: Input<number>;
        readonly reviews: Input<number>;
      };
    }) {
      const inputs = serviceInputs.$provided;
      const { entries, moves, reviews } = inputs;
      const trees = yield* craftComputed('trees', function* () {
        return folderLayoutTrees(yield* entries());
      });
      /** Folders folded by the reviewer, as `side|key` ids. */
      const collapsed = yield* craftPrivate(
        state(
          'collapsedFolders',
          noCollapsedFolders(),
          ({ state: ids, update }) => ({
            toggle: (id: string) =>
              update((current) =>
                current.includes(id)
                  ? current.filter((other) => other !== id)
                  : [...current, id],
              ),
            collapseSide: (
              side: FolderLayoutSide,
              sideIds: readonly string[],
            ) =>
              update((current) => [...withoutSide(current, side), ...sideIds]),
            expandSide: (side: FolderLayoutSide) =>
              update((current) => withoutSide(current, side)),
            /** Unfolds whatever hides these files in the `side` tree. */
            reveal: function* (
              side: FolderLayoutSide,
              links: readonly string[],
            ) {
              const unfold = ancestorFolderIds(
                (yield* trees())[side],
                side,
                links,
              );
              if (!unfold.length) return;
              yield* update((current) =>
                current.filter((id) => !unfold.includes(id)),
              );
            },
            sourceRows: craftUse(
              craftComputed('sourceRows', function* () {
                return visibleRows(
                  (yield* trees()).source,
                  'source',
                  yield* ids(),
                );
              }),
            ),
            proposedRows: craftUse(
              craftComputed('proposedRows', function* () {
                return visibleRows(
                  (yield* trees()).proposed,
                  'proposed',
                  yield* ids(),
                );
              }),
            ),
          }),
        ),
      );
      const { sourceRows, proposedRows } = collapsed;
      yield* craftComputed('folderIds', function* () {
        const { source, proposed } = yield* trees();
        const idsOf = (
          side: FolderLayoutSide,
          rows: readonly FolderLayoutRow[],
        ) =>
          rows
            .filter((row) => row.kind === 'folder')
            .map((row) => folderId(side, row));
        return {
          source: idsOf('source', source),
          proposed: idsOf('proposed', proposed),
        };
      });
      yield* craftMethod('toggleFolder', function* (id: string) {
        yield* collapsed.toggle(id);
      });
      yield* craftMethod(
        'collapseFolders',
        function* (side: FolderLayoutSide, ids: readonly string[]) {
          yield* collapsed.collapseSide(side, ids);
        },
      );
      yield* craftMethod('expandFolders', function* (side: FolderLayoutSide) {
        yield* collapsed.expandSide(side);
      });
      yield* craftMethod(
        'revealFolders',
        function* (side: FolderLayoutSide, links: readonly string[]) {
          yield* collapsed.reveal(side, links);
        },
      );
      yield* craftComputed('summary', function* () {
        const { collisions } = yield* trees();
        const currentEntries = yield* entries();
        const deletions = currentEntries.filter(
          (entry) => entry.status === 'deleted',
        ).length;
        const counts = `${currentEntries.length} files · ${yield* moves()} moves · ${deletions} deletions · ${yield* reviews()} reviews`;
        return collisions
          ? `${counts} · ${collisions} destination collisions`
          : counts;
      });
      yield* craftComputed('root', function* () {
        return (yield* trees()).root || './';
      });
      yield* craftExpose('sourceRows', sourceRows);
      yield* craftExpose('proposedRows', proposedRows);
    },
  );

export const FolderLayoutView = craftComponent(
  'FolderLayoutView',
  {},
  function* (inputs: {
    readonly entries: Input<readonly FolderLayoutEntry[]>;
    readonly sourceGraphHash: Input<string>;
    readonly configHash: Input<string>;
    readonly moves: Input<number>;
    readonly reviews: Input<number>;
  }) {
    const {
      summary,
      trees,
      root,
      sourceRows,
      toggleFolder,
      collapseFolders,
      expandFolders,
      revealFolders,
      folderIds,
      proposedRows,
    } = yield* FolderLayoutViewState();
    return section({ class: folderLayout.view, 'data-folder-layout': 'view' }, [
      div({ class: folderLayout.summary }, [
        strong('Folder layout proposal'),
        small({ class: folderLayout.muted }, summary),
      ]),
      div({ class: folderLayout.legend, 'aria-label': 'Change legend' }, [
        span(
          { class: folderLayout.legendItem, 'data-legendTone': 'moved' },
          '→ Moved',
        ),
        span(
          { class: folderLayout.legendItem, 'data-legendTone': 'deleted' },
          '− Deleted',
        ),
        span(
          { class: folderLayout.legendItem, 'data-legendTone': 'created' },
          '+ Created',
        ),
        span(
          { class: folderLayout.legendItem, 'data-legendTone': 'collision' },
          '⚠ Collision',
        ),
        small(
          { class: folderLayout.hint },
          '▾ folds a folder · click a file or folder to find it in the other tree',
        ),
      ]),
      div({ class: folderLayout.trees, 'data-testid': 'folder-layout-trees' }, [
        tree('Current organisation', 'source', {
          root,
          trees,
          rows: sourceRows,
          toggleFolder,
          collapseFolders,
          expandFolders,
          revealFolders,
          folderIds,
        }),
        tree('Proposed organisation', 'proposed', {
          root,
          trees,
          rows: proposedRows,
          toggleFolder,
          collapseFolders,
          expandFolders,
          revealFolders,
          folderIds,
        }),
      ]),
      p({ class: folderLayout.hash }, function* () {
        return `Graph ${yield* inputs.sourceGraphHash()} · configuration ${yield* inputs.configHash()}`;
      }),
    ]);
  },
).pipe(
  withComponentProviders((inputs) => [provideFolderLayoutViewState(inputs)]),
);

interface TreeBindings {
  readonly root: Input<string>;
  readonly trees: Input<FolderLayoutTrees>;
  readonly rows: Input<readonly VisibleFolderLayoutRow[]>;
  readonly toggleFolder: (id: string) => void;
  readonly collapseFolders: (
    side: FolderLayoutSide,
    ids: readonly string[],
  ) => void;
  readonly expandFolders: (side: FolderLayoutSide) => void;
  readonly revealFolders: (
    side: FolderLayoutSide,
    links: readonly string[],
  ) => void;
  readonly folderIds: Input<
    Readonly<Record<FolderLayoutSide, readonly string[]>>
  >;
}

function tree(
  title: string,
  side: FolderLayoutSide,
  {
    root,
    trees,
    rows,
    toggleFolder,
    collapseFolders,
    expandFolders,
    revealFolders,
    folderIds,
  }: TreeBindings,
) {
  return div({ class: folderLayout.tree, 'data-folder-layout': 'tree' }, [
    div({ class: folderLayout.treeHeading }, [
      div({ class: folderLayout.treeTitle }, [
        strong({ class: folderLayout.treeName }, title),
        small({ class: folderLayout.treeRoot }, root),
      ]),
      div({ class: folderLayout.treeActions }, [
        button(
          'CollapseAllFolders',
          {
            type: 'button',
            class: folderLayout.treeAction,
            title: 'Collapse every folder',
            *click() {
              collapseFolders(side, (yield* folderIds())[side]);
            },
          },
          'Collapse all',
        ),
        button(
          'ExpandAllFolders',
          {
            type: 'button',
            class: folderLayout.treeAction,
            title: 'Expand every folder',
            click() {
              expandFolders(side);
            },
          },
          'Expand all',
        ),
      ]),
    ]),
    ul(
      { class: folderLayout.treeList, 'data-folder-layout': 'list' },
      forNode(rows, { track: (row) => row.key }, (row) =>
        li(
          'FolderLayoutRow',
          {
            class: folderLayout.row,
            'data-folder-layout': 'row',
            'data-rowKind': function* () {
              return (yield* row()).kind;
            },
            'data-rowStatus': function* () {
              return (yield* row()).status;
            },
            style: function* () {
              return {
                ...assign(
                  treeVars.indent,
                  unit.px(8 + (yield* row()).depth * TREE_INDENT_PX),
                ),
                ...assign(
                  treeVars.guides,
                  unit.px((yield* row()).depth * TREE_INDENT_PX + 1),
                ),
              };
            },
            'data-link': function* () {
              return (yield* row()).link;
            },
            *mouseenter(event: Event) {
              highlightFolderLayoutRow(event, true);
            },
            *mouseleave(event: Event) {
              highlightFolderLayoutRow(event, false);
            },
          },
          [
            button(
              'ToggleFolder',
              {
                type: 'button',
                class: folderLayout.icon,
                'data-rowKind': function* () {
                  return (yield* row()).kind;
                },
                'data-rowStatus': function* () {
                  return (yield* row()).status;
                },
                disabled: function* () {
                  return (yield* row()).kind === 'file';
                },
                'aria-label': function* () {
                  const value = yield* row();
                  return value.kind === 'folder'
                    ? `${value.collapsed ? 'Expand' : 'Collapse'} ${value.name}`
                    : undefined;
                },
                'aria-expanded': function* () {
                  const value = yield* row();
                  return value.kind === 'folder'
                    ? String(!value.collapsed)
                    : undefined;
                },
                *click() {
                  const value = yield* row();
                  if (value.kind === 'folder') {
                    toggleFolder(folderId(side, value));
                  }
                },
              },
              function* () {
                return iconOf(yield* row());
              },
            ),
            button(
              'LocateInOtherTree',
              {
                type: 'button',
                class: folderLayout.rowButton,
                title: function* () {
                  return titleOf(yield* row(), side);
                },
                *click(event: Event) {
                  const links = linksUnder(
                    (yield* trees())[side],
                    yield* row(),
                  );
                  revealFolders(otherFolderLayoutSide(side), links);
                  locateFolderLayoutRows(event, links);
                },
              },
              [
                span(
                  {
                    class: folderLayout.label,
                    'data-rowStatus': function* () {
                      return (yield* row()).status;
                    },
                  },
                  function* () {
                    return (yield* row()).name;
                  },
                ),
                small(
                  {
                    class: folderLayout.status,
                    'data-rowKind': function* () {
                      return (yield* row()).kind;
                    },
                    'data-rowStatus': function* () {
                      return (yield* row()).status;
                    },
                    'data-rowCollision': function* () {
                      return String((yield* row()).collisions > 1);
                    },
                  },
                  function* () {
                    const value = yield* row();
                    return value.collisions > 1
                      ? `⚠ ×${value.collisions}`
                      : statusLabel(value);
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  ]);
}
