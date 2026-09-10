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
