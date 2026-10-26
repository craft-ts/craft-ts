import {
  ɵclearCraftPrimitiveReplaySnapshots,
  type ɵinjectCraftMethodReplayRegistry,
  type ɵinjectCraftPrimitiveRegistry,
  type ɵinjectPersistedStorageSnapshotRegistry,
} from '@craft-ts/core';
import {
  isDebugAppSnapshot,
  type DebugInFlightWork,
} from './debug-session-app-snapshot';
import { restoreBrowserStorageSnapshot } from './debug-session-browser-storage';
import {
  CRAFT_DEBUG_REPLAY_CHANNEL,
  CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
} from './debug-session-replay-signals';

/** Set once origin storage is restored and the page reloaded, to avoid a loop. */
const STORAGE_RESTORED_MARKER = 'craft-debug-snapshot-storage-run';
const SNAPSHOT_WAIT_MS = 10_000;
/** Restored values stop being offered to primitives created after this delay. */
const SNAPSHOT_RELEASE_MS = 20_000;
/** How long to wait for the app to create the primitive or method to relaunch. */
const RELAUNCH_WAIT_MS = 10_000;
const RELAUNCH_POLL_MS = 100;

type LaunchOptions = Readonly<{
  allowedOrigins: ReadonlySet<string>;
  registry: ReturnType<typeof ɵinjectCraftPrimitiveRegistry>;
  storageRegistry: ReturnType<typeof ɵinjectPersistedStorageSnapshotRegistry>;
  methods: ReturnType<typeof ɵinjectCraftMethodReplayRegistry>;
  /** Turns a recorded argument back into a value (dates, events, bigints…). */
  reviveArgument: (value: unknown) => unknown;
}>;

function ordinalFree(address: string): string {
  return address
    .split(' / ')
    .map((part) => part.replace(/#\d+$/, ''))
    .join(' / ');
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Relaunches what was running at the chosen moment, once the app has created
 * the methods and primitives involved: the method calls that had issued
 * requests still unanswered, then the primitives that were loading. The
 * requests are real, so they reach the server again.
 */
async function relaunchInFlightWork(
  work: DebugInFlightWork,
  options: LaunchOptions,
): Promise<Readonly<{ relaunched: readonly string[]; failed: readonly string[] }>> {
  const relaunched: string[] = [];
  const failed: string[] = [];
  const deadline = Date.now() + RELAUNCH_WAIT_MS;
  for (const invocation of work.invocations) {
    const wanted = ordinalFree(invocation.address);
    while (
      !options.methods.addresses().some((a) => ordinalFree(a) === wanted) &&
      Date.now() < deadline
    )
      await sleep(RELAUNCH_POLL_MS);
    try {
      const result = options.methods.invoke(
        invocation.address,
        undefined,
        invocation.args.map(options.reviveArgument),
      );
      // The call stays in flight: that is the state being restored.
      if (result instanceof Promise) result.catch(() => undefined);
      relaunched.push(invocation.address);
    } catch {
      failed.push(invocation.address);
    }
  }
  for (const address of work.reloads) {
    const wanted = ordinalFree(address);
    const find = () => {
      const matches = options.registry
        .list()
        .filter((entry) => ordinalFree(entry.address) === wanted);
      return matches.length === 1 ? matches[0] : undefined;
    };
    while (!find() && Date.now() < deadline) await sleep(RELAUNCH_POLL_MS);
    if (find()?.reload?.()) relaunched.push(address);
    else failed.push(address);
  }
  return { relaunched, failed };
}

/**
 * The page was opened by the dashboard (`window.opener`) with a launch id: ask
 * it for the app snapshot and hold the bootstrap until the state is restored,
 * so no component ever renders the live startup state. The app then runs for
 * real — network, timers, recording — which is the point: it is a debug
 * session, not a replay.
 */
export function startDebugSnapshotLaunch(
  options: LaunchOptions,
): Promise<void> | undefined {
  const requestedLaunchId = new URLSearchParams(location.search).get(
    CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
  );
  const opener: Window | null = window.opener;
  if (!requestedLaunchId || !opener || opener === window) return undefined;
  const launchId: string = requestedLaunchId;

  return new Promise<void>((resolve) => {
    let settled = false;

    const send = (type: string, payload: Record<string, unknown> = {}) => {
      for (const origin of options.allowedOrigins) {
        try {
          opener.postMessage(
            { channel: CRAFT_DEBUG_REPLAY_CHANNEL, type, launchId, ...payload },
            origin,
          );
        } catch {
          // A closed dashboard has nobody to tell.
        }
      }
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      try {
        window.sessionStorage.removeItem(STORAGE_RESTORED_MARKER);
      } catch {
        // Marker cleanup is best effort.
      }
      // The launch id must not become router state.
      const url = new URL(location.href);
      url.searchParams.delete(CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM);
      history.replaceState(
        history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
      resolve();
    };

    const releaseRestoredValues = () => {
      ɵclearCraftPrimitiveReplaySnapshots(options.registry);
      window.removeEventListener('pointerdown', releaseRestoredValues, true);
      window.removeEventListener('keydown', releaseRestoredValues, true);
    };

    const storageAlreadyRestored = (): boolean => {
      try {
        return window.sessionStorage.getItem(STORAGE_RESTORED_MARKER) === launchId;
      } catch {
        return false;
      }
    };

    async function onMessage(event: MessageEvent<unknown>): Promise<void> {
      const data = event.data as Record<string, unknown> | null;
      if (
        event.source !== opener ||
        !options.allowedOrigins.has(event.origin) ||
        data?.['channel'] !== CRAFT_DEBUG_REPLAY_CHANNEL ||
        data['type'] !== 'restore-app-snapshot' ||
        data['launchId'] !== launchId ||
        settled
      )
        return;
      const snapshot = data['snapshot'];
      if (!isDebugAppSnapshot(snapshot)) {
        send('snapshot-error', { message: 'Snapshot d’application invalide.' });
        return finish();
      }
      try {
        if (snapshot.browserStorage && !storageAlreadyRestored()) {
          await restoreBrowserStorageSnapshot(snapshot.browserStorage);
          window.sessionStorage.setItem(STORAGE_RESTORED_MARKER, launchId);
          // Frameworks read origin storage while bootstrapping: start over.
          location.reload();
          return;
        }
        await options.storageRegistry.restore(snapshot.storage);
        options.registry.restore(snapshot.primitives);
        window.addEventListener('pointerdown', releaseRestoredValues, true);
        window.addEventListener('keydown', releaseRestoredValues, true);
        setTimeout(releaseRestoredValues, SNAPSHOT_RELEASE_MS);
        send('snapshot-restored', { warnings: snapshot.warnings });
        if (snapshot.inFlight)
          void relaunchInFlightWork(snapshot.inFlight, options).then((result) =>
            send('snapshot-inflight', result),
          );
      } catch (error) {
        send('snapshot-error', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      finish();
    }

    window.addEventListener('message', onMessage);
    const timeout = setTimeout(() => {
      send('snapshot-error', {
        message: 'Le dashboard n’a pas envoyé le snapshot : l’app démarre à son état normal.',
      });
      finish();
    }, SNAPSHOT_WAIT_MS);
    send('snapshot-request');
  });
}
