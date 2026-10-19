import type { SendContextSession } from '@craft-ts/core';

const HEARTBEAT_INTERVAL_MS = 10_000;
const EVENT_TIMING_THRESHOLD_MS = 80;

/** Captures browser stalls alongside the replay timeline while a clip is active. */
export function connectDebugSessionPerformanceCapture(
  session: SendContextSession,
): () => void {
  const observers: PerformanceObserver[] = [];
  let lastHeartbeatAt = performance.now();

  const capture = (name: string, payload: Record<string, unknown>) => {
    if (!session.activeClip) return;
    session.capture('performance', 'emitted', { name, payload });
  };

  if (typeof PerformanceObserver !== 'undefined') {
    observe('longtask', (entry) => {
      if (entry.duration < 50) return;
      const attribution = (
        entry as PerformanceEntry & {
          attribution?: readonly {
            containerName?: string;
            containerType?: string;
          }[];
        }
      ).attribution;
      capture('browser.longtask', {
        startTimeMs: entry.startTime,
        durationMs: entry.duration,
        ...(attribution?.length
          ? {
              attribution: attribution.map((item) => ({
                ...(item.containerType
                  ? { containerType: item.containerType }
                  : {}),
                ...(item.containerName
                  ? { containerName: item.containerName }
                  : {}),
              })),
            }
          : {}),
      });
    });

    observe(
      'event',
      (entry) => {
        if (entry.duration < EVENT_TIMING_THRESHOLD_MS) return;
        const timing = entry as PerformanceEntry & {
          processingStart?: number;
          processingEnd?: number;
          interactionId?: number;
        };
        const processingStart = timing.processingStart ?? entry.startTime;
        const processingEnd = timing.processingEnd ?? processingStart;
        capture('browser.slow-event', {
          eventType: entry.name,
          startTimeMs: entry.startTime,
          durationMs: entry.duration,
          inputDelayMs: Math.max(0, processingStart - entry.startTime),
          processingMs: Math.max(0, processingEnd - processingStart),
          presentationDelayMs: Math.max(
            0,
            entry.duration - (processingEnd - entry.startTime),
          ),
          ...(timing.interactionId
            ? { interactionId: timing.interactionId }
            : {}),
        });
      },
      EVENT_TIMING_THRESHOLD_MS,
    );
  }

  const heartbeat = window.setInterval(() => {
    const now = performance.now();
    const timerDelayMs = Math.max(
      0,
      now - lastHeartbeatAt - HEARTBEAT_INTERVAL_MS,
    );
    lastHeartbeatAt = now;
    capture('browser.heartbeat', {
      timerDelayMs,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
    });
  }, HEARTBEAT_INTERVAL_MS);

  return () => {
    window.clearInterval(heartbeat);
    for (const observer of observers) observer.disconnect();
  };

  function observe(
    type: 'longtask' | 'event',
    onEntry: (entry: PerformanceEntry) => void,
    durationThreshold?: number,
  ): void {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) onEntry(entry);
      });
      if (type === 'event') {
        observer.observe({
          type,
          buffered: true,
          durationThreshold,
        } as PerformanceObserverInit);
      } else {
        observer.observe({ type, buffered: true } as PerformanceObserverInit);
      }
      observers.push(observer);
    } catch {
      // Browser support varies; diagnostics must never affect app behavior.
    }
  }
}
