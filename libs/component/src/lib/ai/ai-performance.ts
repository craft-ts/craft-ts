/** Non-reactive, bounded diagnostics: never feed monitoring back into the app timeline. */
type Measurement = {
  timestamp: number;
  startMs: number;
  phase: string;
  durationMs?: number;
  status?: 'started' | 'ok' | 'error';
  chars?: number;
};
const measurements: Measurement[] = [];
const LIMIT = 120;
let users = 0;
let observer: PerformanceObserver | undefined;

function record(value: Measurement): void {
  measurements.push(value);
  if (measurements.length > LIMIT) measurements.shift();
}

export function startAiMeasurement(phase: string, chars?: number) {
  const startMs = performance.now();
  record({ timestamp: Date.now(), startMs, phase, status: 'started', chars });
  return (status: 'ok' | 'error' = 'ok') => {
    record({
      timestamp: Date.now(),
      startMs,
      phase,
      status,
      durationMs: performance.now() - startMs,
      chars,
    });
  };
}

export function measureAi<T>(phase: string, work: () => T): T {
  const finish = startAiMeasurement(phase);
  try {
    const result = work();
    finish();
    return result;
  } catch (error) {
    finish('error');
    throw error;
  }
}

export async function writeAiClipboard(text: string): Promise<void> {
  const finish = startAiMeasurement('clipboard.write', text.length);
  try {
    await navigator.clipboard.writeText(text);
    finish();
  } catch (error) {
    finish('error');
    throw error;
  }
}

/** Shared across controllers, disconnected with the last application. No polling. */
export function observeAiPerformance(): () => void {
  users++;
  if (users === 1 && typeof PerformanceObserver !== 'undefined') {
    try {
      // `measure` carries the craft runtime's own slow-path marks
      // (`craft:*`), which attribute a long task to its cause.
      const entryTypes = ['longtask', 'measure'].filter((type) =>
        PerformanceObserver.supportedEntryTypes.includes(type),
      );
      if (entryTypes.length > 0) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'measure' && !entry.name.startsWith('craft:'))
              continue;
            record({
              timestamp: performance.timeOrigin + entry.startTime,
              startMs: entry.startTime,
              phase:
                entry.entryType === 'measure' ? entry.name : 'browser.longtask',
              durationMs: entry.duration,
            });
          }
        });
        observer.observe({ entryTypes });
      }
    } catch {
      observer?.disconnect();
      observer = undefined;
    }
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (--users === 0) {
      observer?.disconnect();
      observer = undefined;
    }
  };
}

export function aiPerformanceSection(): string {
  return (
    '\n\n# Send Context performance diagnostics\n' +
    'Bounded history for this page. Durations in ms; chars are UTF-16 lengths. ' +
    'Browser long tasks are correlations, not proof of causation. ' +
    'The current clipboard completion and subsequent stalls appear in the next export.\n' +
    '```json\n' +
    JSON.stringify(
      {
        version: 1,
        longTasksSupported:
          typeof PerformanceObserver !== 'undefined' &&
          PerformanceObserver.supportedEntryTypes?.includes('longtask') ===
            true,
        measurements: measurements.slice(),
      },
      null,
      2,
    ) +
    '\n```'
  );
}
