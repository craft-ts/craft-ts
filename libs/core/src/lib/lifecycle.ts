/** Run every synchronous release in order before surfacing any failures. */
export function runCraftCleanups(cleanups: Iterable<() => void>): void {
  let errors: unknown[] | undefined;
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      if (errors) errors.push(error);
      else errors = [error];
    }
  }
  if (!errors) return;
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Craft cleanup failed.');
  }
}

const destroyedOwners = new WeakSet<object>();

/** A bound, one-shot release which drops its callback references before running. */
export function createCraftCleanup(cleanups: Iterable<() => void>): () => void {
  let pending: Iterable<() => void> | undefined = cleanups;
  return () => {
    const current = pending;
    pending = undefined;
    if (current) runCraftCleanups(current);
  };
}

/** @internal Shared one-shot ownership for grouped and allocation-free teardown. */
export function beginCraftOwnerDestruction(owner: object): boolean {
  if (destroyedOwners.has(owner)) return false;
  destroyedOwners.add(owner);
  return true;
}

/** Close an owner before releasing it, including reentrant destruction. */
export function destroyCraftOwner(
  owner: object,
  cleanups: Iterable<() => void>,
): void {
  if (!beginCraftOwnerDestruction(owner)) return;
  runCraftCleanups(cleanups);
}
