import { describe, expect, it } from 'vitest';
import {
  button,
  craftComponent,
  renderCraftComponent,
} from '@craft-ts/component';
import { provideCorrelationIdTracking, subject } from '@craft-ts/core';
import {
  fromSubscribable,
  map,
  provideStreamTrace,
  streamSignal,
  traceStage,
  type StreamTraceContext,
  type StreamTraceEvent,
} from '../index';

// The layer the user sees: a real click, the real DOM event hook rotating the
// correlation id, and a stream started by the handler. The trace must link the
// stream's whole life back to the gesture that started it.
describe('stream trace in a rendered component', () => {
  it('links a stream started by a click to that click', async () => {
    const seen: Array<{ event: StreamTraceEvent; context: StreamTraceContext }> =
      [];
    const live = subject<number>();

    const Panel = craftComponent('StreamPanel', {}, function* () {
      const feed = yield* streamSignal(
        'feed',
        fromSubscribable(live).pipe(
          traceStage('raw'),
          map((n: number) => n * 2),
        ),
        { autoStart: false },
      );
      return button('load', { type: 'button', click: feed.start }, 'load');
    });

    const rendered = await renderCraftComponent(Panel, {
      providers: [
        provideCorrelationIdTracking(),
        provideStreamTrace((event, context) => seen.push({ event, context })),
      ] as never,
    });

    expect(seen).toEqual([]);

    (rendered.element.querySelector('button') as HTMLButtonElement).click();
    await rendered.flush();
    live.next(21);
    await rendered.flush();

    const subscribe = seen.find((entry) => entry.event.kind === 'subscribe');
    expect(subscribe?.context.name).toBe('feed');
    expect(subscribe?.context.root).toBe('signal');
    expect(subscribe?.context.startCorrelationId).toMatch(/click/);

    const kinds = seen.map((entry) =>
      entry.event.kind === 'stage'
        ? `stage:${entry.event.stage}`
        : entry.event.kind,
    );
    expect(kinds).toEqual(['subscribe', 'stage:raw', 'next']);
    expect(new Set(seen.map((entry) => entry.context.streamId)).size).toBe(1);

    rendered.destroy();
  });
});
