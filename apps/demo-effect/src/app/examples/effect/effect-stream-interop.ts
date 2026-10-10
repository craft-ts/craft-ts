// Two directions of the Effect <-> craft stream bridge, in one page: an Effect
// `Stream` consumed as a craft stream, and a craft stream consumed by an Effect.

import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed, craftService, craftUse } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { interval, map, streamSignal, take } from '@craft-ts/stream';
import { fromStream, toStream } from '@craft-ts/stream-effect';
import { Effect, Stream } from 'effect';
import { example } from '../../effect-demo.style';

export const { EffectStreamInteropView, provideEffectStreamInteropView } =
  craftService(
    { name: 'effectStreamInteropView', providedIn: 'toProvide' },
    function* () {
      // Effect -> craft: a slow Effect stream, read as a craft stream. Its
      // failures would type the craft stream's exceptions.
      const slow = Stream.make('alpha', 'beta', 'gamma').pipe(
        Stream.mapEffect((word) =>
          Effect.sleep('400 millis').pipe(Effect.as(word)),
        ),
      );
      yield* streamSignal(
        'words',
        fromStream(slow).pipe(map((word: string) => word.toUpperCase())),
        { autoStart: false },
      );

      // craft -> Effect: a craft stream, collected by an Effect program. The
      // craft stream is built here, where the injection context is, and the
      // Effect only runs it.
      const ticks = toStream(interval(300).pipe(take(4)));
      yield* queryEffect(
        'collected',
        {
          method: (_run: number) => _run,
          loader: () =>
            Stream.runCollect(ticks).pipe(
              Effect.map((chunk) => ({ ticks: Array.from(chunk).join(', ') })),
            ),
        },
        ({ resource }) => ({
          ticksText: craftUse(
            craftComputed('ticksText', function* () {
              const collected = yield* resource.value();
              return collected?.ticks ?? '-';
            }),
          ),
        }),
      );
    },
  );

const EffectStreamInteropComponent = craftComponent(
  'EffectStreamInteropComponent',
  { providers: [provideEffectStreamInteropView()] },
  function* () {
    const view = EffectStreamInteropView;
    return div({ class: example.card, 'data-exampleTint': 'violet' }, [
      heading({ class: example.title }, 'Effect streams and craft streams'),
      p(
        { class: example.intro },
        'An Effect Stream read as a craft stream, and a craft stream collected by an Effect program.',
      ),
      div({ class: example.panel }, [
        p({ class: example.panelTitle }, 'Effect → craft'),
        div({ class: example.actions }, [
          button(
            'start-words',
            { class: example.button, type: 'button', click: view.words.start },
            'Start',
          ),
        ]),
        p({ class: example.result }, [
          strong('Status: '),
          span(view.words.status),
        ]),
        p({ class: example.result }, [
          strong('Error: '),
          span(function* () {
            return String((yield* view.words.error()) ?? '-');
          }),
        ]),
        p({ class: example.result }, [
          strong('Latest: '),
          span(function* () {
            return String((yield* view.words.value()) ?? '-');
          }),
        ]),
      ]),
      div({ class: example.panel }, [
        p({ class: example.panelTitle }, 'craft → Effect'),
        div({ class: example.actions }, [
          button(
            'collect-ticks',
            {
              class: example.button,
              type: 'button',
              click: function* () {
                yield* view.collected.call(1);
              },
            },
            'Collect 4 ticks',
          ),
        ]),
        ifNode(
          view.collected.isLoading,
          () => p({ class: example.result }, 'Collecting…'),
          () =>
            p({ class: example.result }, [
              strong('Collected: '),
              span(view.collected.ticksText),
            ]),
        ),
      ]),
    ]);
  },
);

export default EffectStreamInteropComponent;
