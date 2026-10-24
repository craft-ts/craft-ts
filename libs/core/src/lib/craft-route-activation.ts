import { ɵcraftValueService } from './craft-service';

export type CraftRouteActivationEvent = Readonly<{
  activationId: string;
  navigationId?: number;
  url: string;
  routePath: string;
  componentName?: string;
  outcome: 'activated' | 'failed';
  error?: string;
}>;

export type CraftRouteActivationWaiter = Readonly<{
  activationId: string;
  promise: Promise<CraftRouteActivationEvent>;
  cancel(): void;
}>;

type CraftRouteActivationTracker = {
  begin(url: string): void;
  publish(
    event: Omit<CraftRouteActivationEvent, 'activationId'>,
  ): CraftRouteActivationEvent;
  waitFor(url: string, timeoutMs?: number): CraftRouteActivationWaiter;
  waitForNext(url: string, timeoutMs?: number): CraftRouteActivationWaiter;
  subscribe(
    listener: (event: CraftRouteActivationEvent) => void,
  ): () => void;
};

type PendingActivation = {
  activationId: string;
  url: string;
  resolve: (event: CraftRouteActivationEvent) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function createCraftRouteActivationTracker(): CraftRouteActivationTracker {
  let sequence = 0;
  let lastEvent: CraftRouteActivationEvent | undefined;
  const pending = new Set<PendingActivation>();
  const listeners = new Set<(event: CraftRouteActivationEvent) => void>();
  const matchesUrl = (left: string, right: string) =>
    normalizeUrl(left) === normalizeUrl(right);
  const createWaiter = (
    url: string,
    timeoutMs: number,
  ): CraftRouteActivationWaiter => {
    const activationId = `route-navigation-${++sequence}`;
    let resolve!: (event: CraftRouteActivationEvent) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<CraftRouteActivationEvent>(
      (resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      },
    );
    const waiter: PendingActivation = {
      activationId,
      url,
      resolve,
      reject,
      timer: setTimeout(() => {
        pending.delete(waiter);
        reject(
          new Error(
            `Timed out after ${timeoutMs} ms waiting for route activation at ${url}.`,
          ),
        );
      }, timeoutMs),
    };
    pending.add(waiter);
    return {
      activationId,
      promise,
      cancel: () => {
        if (!pending.delete(waiter)) return;
        clearTimeout(waiter.timer);
        reject(new Error(`Route activation wait cancelled for ${url}.`));
      },
    };
  };

  return {
    begin(url) {
      lastEvent = undefined;
      for (const waiter of pending) {
        if (matchesUrl(waiter.url, url)) continue;
        clearTimeout(waiter.timer);
        pending.delete(waiter);
        waiter.reject(
          new Error(`Route activation was superseded by navigation to ${url}.`),
        );
      }
    },
    publish(event) {
      const waiter = [...pending].find((candidate) =>
        matchesUrl(candidate.url, event.url),
      );
      const published: CraftRouteActivationEvent = {
        ...event,
        activationId: waiter?.activationId ?? `route-activation-${++sequence}`,
      };
      lastEvent = published;
      for (const listener of listeners) {
        try {
          listener(published);
        } catch {
          // Diagnostics must never prevent the route transition from settling.
        }
      }
      if (waiter) {
        clearTimeout(waiter.timer);
        pending.delete(waiter);
        if (published.outcome === 'activated') waiter.resolve(published);
        else
          waiter.reject(
            new Error(
              published.error ?? `Route activation failed for ${published.url}.`,
            ),
          );
      }
      return published;
    },
    waitFor(url, timeoutMs = 10_000) {
      const activationId = `route-navigation-${++sequence}`;
      if (lastEvent && matchesUrl(lastEvent.url, url)) {
        const currentEvent = { ...lastEvent, activationId };
        return {
          activationId,
          promise:
            currentEvent.outcome === 'activated'
              ? Promise.resolve(currentEvent)
              : Promise.reject(
                  new Error(
                    currentEvent.error ??
                      `Route activation failed for ${url}.`,
                  ),
                ),
          cancel: () => undefined,
        };
      }
      return createWaiter(url, timeoutMs);
    },
    waitForNext(url, timeoutMs = 10_000) {
      return createWaiter(url, timeoutMs);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const craftRouteActivationTrackerService = ɵcraftValueService(
  { name: 'CraftRouteActivationTracker', providedIn: 'global' },
  createCraftRouteActivationTracker,
) as unknown as {
  CraftRouteActivationTracker: () => Generator<
    unknown,
    CraftRouteActivationTracker,
    unknown
  >;
  CRAFT_ROUTE_ACTIVATION_TRACKER_META_DATA: {
    inject(): CraftRouteActivationTracker;
  };
};

export const ɵinjectCraftRouteActivationTracker =
  (): CraftRouteActivationTracker =>
    craftRouteActivationTrackerService.CRAFT_ROUTE_ACTIVATION_TRACKER_META_DATA.inject();

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value, 'http://craft-router.local');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}
