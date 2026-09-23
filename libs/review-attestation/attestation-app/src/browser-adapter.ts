/**
 * Browser-only capabilities needed by the review surface.
 *
 * CraftTS deliberately keeps BrowserDocument narrow. This app additionally
 * needs low-level DOM APIs to inspect an iframe, ranges and selections, so the
 * unavoidable host access is kept at this single adapter boundary.
 */
export const reviewDocument = globalThis.document;

export const reviewStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const reviewLanguages = (): readonly string[] =>
  globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'en'];

export const reviewClipboard = (): Clipboard | undefined =>
  globalThis.navigator?.clipboard;

const folderLayoutRowOf = (event: Event): HTMLElement | null => {
  const target = event.currentTarget;
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>('.folder-layout-row')
    : null;
};

const folderLayoutRowsLinkedTo = (
  root: Element,
  links: readonly string[],
): HTMLElement[] =>
  links.flatMap((link) => [
    ...root.querySelectorAll<HTMLElement>(
      `.folder-layout-row[data-link="${CSS.escape(link)}"]`,
    ),
  ]);

/**
 * Highlights a hovered folder-layout file and its row in the other tree.
 * Highlight only: scrolling is left to an explicit click.
 */
export const highlightFolderLayoutRow = (
  event: Event,
  active: boolean,
): void => {
  const row = folderLayoutRowOf(event);
  const view = row?.closest('.folder-layout-view');
  const link = row?.dataset['link'];
  if (!view || !link) return;
  folderLayoutRowsLinkedTo(view, [link]).forEach((candidate) =>
    candidate.classList.toggle('linked', active),
  );
};

/**
 * Marks the clicked row and every row of `links` in the other tree, then
 * scrolls that tree (inside its own list, never the page) to the first one.
 */
export const locateFolderLayoutRows = (
  event: Event,
  links: readonly string[],
): void => {
  const row = folderLayoutRowOf(event);
  const view = row?.closest('.folder-layout-view');
  const tree = row?.closest('.folder-layout-tree');
  if (!row || !view || !tree) return;

  // Next frame: the render that unfolds collapsed ancestors has landed.
  requestAnimationFrame(() => {
    view
      .querySelectorAll('.folder-layout-row.located')
      .forEach((located) => located.classList.remove('located'));
    row.classList.add('located');

    const other = [...view.querySelectorAll('.folder-layout-tree')].find(
      (candidate) => candidate !== tree,
    );
    if (!other) return;
    const targets = folderLayoutRowsLinkedTo(other, links);
    targets.forEach((target) => target.classList.add('located'));

    const first = targets[0];
    const list = first?.closest<HTMLElement>('.folder-layout-tree-list');
    if (!first || !list) return;
    const listBox = list.getBoundingClientRect();
    const rowBox = first.getBoundingClientRect();
    const offset = rowBox.top - listBox.top + list.scrollTop;
    list.scrollTo({
      top: offset - (list.clientHeight - rowBox.height) / 2,
      behavior: 'smooth',
    });
  });
};
