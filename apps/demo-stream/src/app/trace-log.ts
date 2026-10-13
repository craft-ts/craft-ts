import { craftSignal } from '@craft-ts/core';
import {
  provideStreamTrace,
  type StreamTraceContext,
  type StreamTraceEvent,
} from '@craft-ts/stream';

const MAX_LINES = 40;

/** The most recent stream trace lines, newest last. */
export const traceLines = craftSignal<readonly string[]>([]);

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

/** Feeds every root stream subscription of the app into {@link traceLines}. */
export const provideDemoStreamTrace = () =>
  provideStreamTrace((event: StreamTraceEvent, context: StreamTraceContext) => {
    const label = `${context.name ?? context.streamId} [${context.startCorrelationId ?? 'no gesture'}]`;
    traceLines.update((lines) =>
      [...lines, `${label} ${describe(event)}`].slice(-MAX_LINES),
    );
  });
