import { craftService, craftUse, state } from '@craft-ts/core';
import {
  provideStreamTrace,
  type StreamTraceContext,
  type StreamTraceEvent,
} from '@craft-ts/stream';

const MAX_LINES = 40;
const EMPTY_LINES: readonly string[] = [];

/** The most recent stream trace lines, newest last. */
export const { TraceLog } = craftService(
  { name: 'TraceLog', providedIn: 'global' },
  function* () {
    yield* state('lines', EMPTY_LINES, ({ update, set }) => ({
      append: (line: string) =>
        update((current) => [...current, line].slice(-MAX_LINES)),
      clear: () => set([]),
    }));
  },
);

function describe(event: StreamTraceEvent): string {
  switch (event.kind) {
    case 'next':
      return `next #${event.index} ${JSON.stringify(event.value)}`;
    case 'stage':
      return `· ${event.stage}: ${event.notification}${
        event.notification === 'next' ? ` ${JSON.stringify(event.value)}` : ''
      }`;
    case 'exception':
      return `exception ${JSON.stringify(event.exception)}`;
    case 'error':
      return `defect ${String(event.error)}`;
    default:
      return event.kind;
  }
}

/** Feeds every root stream subscription of the app into {@link TraceLog}. */
export const provideDemoStreamTrace = () =>
  provideStreamTrace((event: StreamTraceEvent, context: StreamTraceContext) => {
    const label = `${context.name ?? context.streamId} [${context.startCorrelationId ?? 'no gesture'}]`;
    // The observer is a synchronous integration callback outside a Craft generator.
    // eslint-disable-next-line craft-ts/no-craft-use
    craftUse(TraceLog.lines.append(`${label} ${describe(event)}`));
  });
