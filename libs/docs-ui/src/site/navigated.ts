/**
 * What the document announces when the reader has moved to another page without the
 * browser loading it (`CustomEvent` on `document`). Whatever a page left open — the
 * search, the drawer, a menu — listens and closes: the old page's furniture does not
 * follow the reader to the next one.
 */
export const NAVIGATED_EVENT = 'doc-navigated';
