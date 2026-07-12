import type { InsertionStateFactoryContext } from './query.core';

/**
 * No-op insertion used to preserve contextual typing in insertion chains of
 * the form-tree helpers (`insertForm` / `insertSelectFormTree`), which keep a
 * variadic signature.
 *
 * Usage:
 * `insertSelectFormTree('name', insertNoopTypingAnchor, insertFormAttributes(...))`
 *
 * It is NOT needed with `insertSelect`: use
 * `insertSelect('grid', (gridContext) => craftPipe(gridContext, ...))`,
 * which preserves nested contextual typing by itself.
 */
export function insertNoopTypingAnchor<
  StateType,
  PreviousInsertionsOutputs = {},
>(
  _context: InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs>,
): {} {
  return {};
}
