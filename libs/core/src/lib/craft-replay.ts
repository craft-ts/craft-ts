/**
 * Whether the application is currently restoring a recorded state.
 *
 * A replay writes values straight into primitives. Two things must know about
 * it: a resource loader, which would otherwise refetch and overwrite the value
 * just restored, and tooling, which would otherwise log a rewind as ordinary
 * user activity.
 *
 * The flag is a synchronous ambient because a restore IS synchronous — the
 * reactive graph flushes inside the write, so a loader triggered by a restored
 * parameter runs before the restore returns.
 */
let replayDepth = 0;

/** `true` while a recorded state is being restored. */
export function isCraftReplaying(): boolean {
  return replayDepth > 0;
}

/** Runs `restore` with {@link isCraftReplaying} reporting `true`. */
export function ɵwithCraftReplay<Result>(restore: () => Result): Result {
  replayDepth += 1;
  try {
    return restore();
  } finally {
    replayDepth -= 1;
  }
}
