import { reviewStorage } from './browser-adapter';

export type Ide = 'vscode' | 'cursor' | 'zed';

const IDE_KEY = 'craft-review-ide';

export const isIde = (value: unknown): value is Ide =>
  value === 'vscode' || value === 'cursor' || value === 'zed';

export const initialIde = (): Ide => {
  try {
    const stored = reviewStorage()?.getItem(IDE_KEY);
    return isIde(stored) ? stored : 'vscode';
  } catch {
    return 'vscode';
  }
};

export const storeIde = (ide: Ide): void => {
  try {
    reviewStorage()?.setItem(IDE_KEY, ide);
  } catch {
    // The choice still applies until this page is closed.
  }
};

/** Subjects contain a component node before their scenario or obligation. */
export const sourcePathOf = (reference: string): string | undefined =>
  /(?:^|:)component:([^:#]+\.[cm]?[jt]sx?)(?=[:#]|$)/.exec(reference)?.[1];

/** Only repository-relative paths may be joined to the server's project root. */
export const ideLinkUrl = (
  available: boolean | undefined,
  file: string | undefined,
  ide: Ide,
  line?: number,
): string | undefined => {
  if (!available || !file || file.startsWith('/')) return;
  const segments = file.split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\'),
    )
  )
    return;
  const params = new URLSearchParams({ ide, file });
  if (line && Number.isSafeInteger(line) && line > 0)
    params.set('line', String(line));
  return `/api/open-in-ide?${params}`;
};
