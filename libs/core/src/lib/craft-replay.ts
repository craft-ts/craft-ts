/**
 * Whether the application is currently restoring a recorded state.
 *
 * A replay can invoke application methods and restore captured primitive
 * values. Transport boundaries use this flag to substitute recorded results
 * and refuse live network fallbacks; tooling uses it to avoid logging rewinds
 * as ordinary user activity.
 *
 * The flag is a synchronous ambient because a restore IS synchronous — the
 * reactive graph flushes inside the write, so a loader triggered by a restored
 * parameter runs before the restore returns.
 */
let replayDepth = 0;
let replayMode = false;

/** `true` while restoring a recorded state or running a replay session. */
export function isCraftReplaying(): boolean {
  return replayMode || replayDepth > 0;
}

/** `true` only while a recorded primitive state is being written back. */
export function ɵisCraftRestoringState(): boolean {
  return replayDepth > 0;
}

/** Enables or disables replay mode for the lifetime of a replay session. */
export function ɵsetCraftReplayMode(active: boolean): void {
  replayMode = active;
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
