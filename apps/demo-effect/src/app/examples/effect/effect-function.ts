import {
  craftComponent,
  div,
  heading,
  ifNode,
  matchNode,
  pendingNode,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftService, craftComputed, settled, craftUse, craftExpose } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { Effect } from 'effect';
import { Database } from './effect-database';
import { example } from '../../effect-demo.style';

/**
 * The business operation depends on the Database capability, not on a
 * concrete database implementation. The route supplies that implementation.
 */
export const getData = Effect.gen(function* () {
  const db = yield* Database;
  return yield* db.query('SELECT id, value FROM demo_data');
});

export const { EffectFunctionView, provideEffectFunctionView } = craftService(
  { name: 'effectFunctionView', providedIn: 'toProvide' },
  function* () {
    const dataQuery = yield* queryEffect(
      'dataQuery',
      {
        params: () => true, // initial load
        loader: () => getData,
      },
      ({ resource }) => ({
        hasData: craftUse(craftComputed('hasData', () => resource.hasValue())),
        summary: craftUse(craftComputed('summary', function* () {
          const rows = yield* settled(resource);
          return rows.map(({ id, value }) => `${id}: ${value}`).join(', ');
        })),
      }),
    );

    yield* craftExpose('hasData', dataQuery.hasData);
    yield* craftExpose('summary', dataQuery.summary);
  },
);

const EffectFunctionComponent = craftComponent(
  'EffectFunctionComponent',
  {
    providers: [provideEffectFunctionView()],
  },
  function* () {
    const { dataQuery, hasData, summary } = yield* EffectFunctionView();
    return div({ class: example.card, 'data-exampleTint': 'violet' }, [
      heading(
        { class: example.title },
        'Use an Effect function with injected Database',
      ),
      p(
        { class: example.intro },
        'The component calls getData. That function resolves Database through Effect’s context, while the route provides an in-memory implementation.',
      ),
      div({ class: example.panel }, [
        p({ class: example.panelTitle }, 'Database result'),
        ifNode(
          dataQuery.isLoading,
          () =>
            p(
              { class: example.result },
              'Connecting to the in-memory database…',
            ),
          () =>
            ifNode(
              hasData,
              () => p({ class: example.result }, [strong('Rows: '), summary]),
              () =>
                matchNode.exhaustive(dataQuery.exceptions.loader, '_tag', {
                  DatabaseConnectionError: () =>
                    p(
                      { class: example.result },
                      'DatabaseConnectionError: the in-memory connection failed.',
                    ),
                }),
            ),
        ),
      ]).pipe(
        pendingNode({
          fallback: () =>
            p(
              { class: example.result },
              'Connecting to the in-memory database…',
            ),
        }),
      ),
      p({ class: example.note }, [
        'The route provides ',
        span({ class: example.mono }, 'InMemoryDatabaseLive'),
        '. The loader only yields ',
        span({ class: example.mono }, 'getData'),
        ', and the typed Effect failure is rendered by ',
        span({ class: example.mono }, 'matchNode'),
        ' after the ',
        span({ class: example.mono }, 'pendingNode'),
        ' has shown the connection state.',
      ]),
    ]);
  },
);

export default EffectFunctionComponent;
