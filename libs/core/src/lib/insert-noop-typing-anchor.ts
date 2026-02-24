import type { InsertionStateFactoryContext } from './query.core';

/**
 * No-op insertion used to preserve contextual typing in insertion chains.
 *
 * Usage:
 * `insertSelect('grid', insertNoopTypingAnchor, insertSelect('row', ...))`
 */
export function insertNoopTypingAnchor<
  StateType,
  PreviousInsertionsOutputs = {},
>(
  _context: InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs>,
): {} {
  return {};
}
