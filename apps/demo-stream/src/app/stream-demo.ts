import {
  button,
  craftComponent,
  div,
  heading,
  input,
  p,
  pre,
  section,
  span,
} from '@craft-ts/component';
import { craftExpose, craftService, subject } from '@craft-ts/core';
import {
  debounce,
  distinctUntilChanged,
  filter,
  fromSubscribable,
  interval,
  map,
  of,
  streamSignal,
  switchMap,
  take,
  traceStage,
} from '@craft-ts/stream';
import { provideSearchApi, SearchApi } from './search-api';
import { traceLines } from './trace-log';

function eventValue(event: Event): string {
  const target = event.target;
  return target && 'value' in target && typeof target.value === 'string'
    ? target.value
    : '';
}

export const { StreamDemoView, provideStreamDemoView } = craftService(
  { name: 'streamDemoView', providedIn: 'toProvide' },
  function* () {
    const terms = subject<string>();
    yield* craftExpose('type', (term: string) => terms.next(term));

    // Typed search: the handler yields the SearchApi service, so the service is
    // part of the stream's type — and so is the exception it may end with.
    yield* streamSignal(
      'results',
      fromSubscribable(terms).pipe(
        traceStage('typed'),
        debounce(300),
        distinctUntilChanged(),
        filter((term: string) => term.trim().length >= 2),
        traceStage('settled'),
        switchMap(function* (term: string) {
          const api = yield* SearchApi();
          return api.search(term.trim());
        }),
        traceStage('answered'),
      ),
    );

    yield* streamSignal(
      'ticker',
      interval(1000).pipe(
        map((n: number) => n + 1),
        take(10),
      ),
      { autoStart: false },
    );

    // A defect (an unexpected throw), as opposed to a typed exception: it is
    // reported to the trace and takes an app snapshot.
    yield* streamSignal(
      'defect',
      of(1).pipe(
        map(() => {
          // A technical throw on purpose: this demo shows what a DEFECT looks like
          // in the trace, as opposed to a typed exception.
          // eslint-disable-next-line craft-ts/no-throw
          throw new Error('demo defect: unexpected throw in a handler');
        }),
      ),
      { autoStart: false },
    );
  },
);

const StreamDemo = craftComponent(
  'StreamDemo',
  { providers: [provideSearchApi(), provideStreamDemoView()] },
  () =>
    div([
      heading('Typed streams'),
      section([
        heading('Live search'),
        p(
          'Debounced, deduplicated, switchMap to a typed API. Type "boom" for a typed exception.',
        ),
        input('search', {
          type: 'search',
          placeholder: 'dune, earthsea, boom…',
          'aria-label': 'Search books',
          input: function* (event: Event) {
            yield* StreamDemoView.type(eventValue(event));
          },
        }),
        p(['Status: ', span(StreamDemoView.results.status)]),
        p([
          'Result: ',
          span(function* () {
            return JSON.stringify(
              (yield* StreamDemoView.results.value()) ?? null,
            );
          }),
        ]),
        p([
          'Exception: ',
          span(function* () {
            return JSON.stringify(
              (yield* StreamDemoView.results.exception()) ?? null,
            );
          }),
        ]),
      ]),
      section([
        heading('Ticker'),
        button(
          'start-ticker',
          { type: 'button', click: StreamDemoView.ticker.start },
          'Start',
        ),
        button(
          'stop-ticker',
          { type: 'button', click: StreamDemoView.ticker.stop },
          'Stop',
        ),
        p(['Status: ', span(StreamDemoView.ticker.status)]),
        p([
          'Tick: ',
          span(function* () {
            return String((yield* StreamDemoView.ticker.value()) ?? '-');
          }),
        ]),
      ]),
      section([
        heading('Defect'),
        button(
          'raise-defect',
          { type: 'button', click: StreamDemoView.defect.start },
          'Raise a defect',
        ),
        p(['Status: ', span(StreamDemoView.defect.status)]),
        p([
          'Error: ',
          span(function* () {
            return String((yield* StreamDemoView.defect.error()) ?? '-');
          }),
        ]),
      ]),
      section([
        heading('Stream trace'),
        p('Every root subscription, with the gesture that started it.'),
        pre({ 'data-testid': 'trace' }, () => traceLines().join('\n')),
      ]),
    ]),
);

export default StreamDemo;
