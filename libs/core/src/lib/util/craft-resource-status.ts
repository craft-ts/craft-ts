import type { ResourceStatus } from '../host/craft-compat';

/**
 * The status a craft primitive (`query` / `mutation` / `asyncProcess`) exposes
 * on its public façade. Maps {@link ResourceStatus} and replaces the
 * technical `'error'` state with the craft-business `'exception'` state: a
 * resource reaches `'exception'` when a loader/params `craftException` is present.
 */
export type CraftResourceStatus =
  | 'idle'
  | 'loading'
  | 'reloading'
  | 'resolved'
  | 'local'
  | 'exception';

/**
 * Maps a raw resource {@link ResourceStatus} to the Craft-facing
 * {@link CraftResourceStatus}. `hasException` is the business discriminant and is
 * checked first; a residual technical `'error'` is also surfaced as `'exception'`
 * to keep the public type sound (in the expected craft model errors are left to
 * throw, so that case does not occur).
 */
export function toCraftStatus(
  raw: ResourceStatus,
  hasException: boolean,
): CraftResourceStatus {
  if (hasException || raw === 'error') {
    return 'exception';
  }
  return raw as CraftResourceStatus;
}
