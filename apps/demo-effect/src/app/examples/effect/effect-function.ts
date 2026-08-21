/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  craftComponent,
  div,
  heading,
  ifBlock,
  matchBlock,
  pendingBlock,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed, settled, type InsertionParams } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { Effect } from 'effect';
import { Database } from './effect-database';

/**
 * The business operation depends on the Database capability, not on a
 * concrete database implementation. The route supplies that implementation.
 */
export const getData = Effect.gen(function* () {
  const db = yield* Database;
  return yield* db.query('SELECT id, value FROM demo_data');
});

type DataInsertionContext = InsertionParams<
  Effect.Success<typeof getData>,
  true,
  { params: unknown; loader: Effect.Error<typeof getData> },
  Record<never, never>,
  'effectFunctionQuery'
>;

const createDataInsertion = ({ resource }: DataInsertionContext) => ({
  hasData: craftComputed('hasData', () => resource.hasValue()),
  summary: craftComputed('summary', function* () {
    const rows = yield* settled(resource);
    return rows.map(({ id, value }) => `${id}: ${value}`).join(', ');
  }),
});

const EffectFunctionComponent = craftComponent(
  'EffectFunctionComponent',
  {
    styles: `
      :scope { display: block; max-width: 880px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #ede9fe; border-radius: 12px; color: #312e81; background: #f5f3ff; }
      :scope h1 { margin: 0 0 0.5rem; color: #2e1065; }
      .intro { margin: 0 0 1.25rem; color: #4338ca; line-height: 1.55; }
      .panel { padding: 1rem 1.1rem; border: 1px solid #ddd6fe; border-radius: 8px; background: #fff; }
      .panel-title { margin: 0 0 0.65rem; color: #64748b; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      .result { margin: 0; color: #1e1b4b; font-size: 1.1rem; line-height: 1.5; }
      .note { margin-top: 1rem; color: #4c1d95; font-size: 0.85rem; line-height: 1.6; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #ede9fe; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    const dataQuery = yield* queryEffect(
      'effectFunctionQuery',
      {
        params: () => true,
        loader: () => getData,
      },
      createDataInsertion,
    );

    return {
      dataQuery,
      hasData: dataQuery.hasData,
      summary: dataQuery.summary,
    };
  },
  ({ dataQuery, hasData, summary }) =>
    div([
      heading('Use an Effect function with injected Database'),
      p(
        { class: 'intro' },
        'The component calls getData. That function resolves Database through Effect’s context, while the route provides an in-memory implementation.',
      ),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Database result'),
        ifBlock(
          dataQuery.isLoading,
          () => p({ class: 'result' }, 'Connecting to the in-memory database…'),
          () =>
            ifBlock(
              hasData,
              () => p({ class: 'result' }, [strong('Rows: '), summary]),
              () =>
                matchBlock.exhaustive(dataQuery.exceptions.loader, '_tag', {
                  DatabaseConnectionError: () =>
                    p(
                      { class: 'result' },
                      'DatabaseConnectionError: the in-memory connection failed.',
                    ),
                }),
            ),
        ),
      ]).pipe(
        pendingBlock({
          fallback: () =>
            p({ class: 'result' }, 'Connecting to the in-memory database…'),
        }),
      ),
      p({ class: 'note' }, [
        'The route provides ',
        span({ class: 'mono' }, 'InMemoryDatabaseLive'),
        '. The loader only yields ',
        span({ class: 'mono' }, 'getData'),
        ', and the typed Effect failure is rendered by ',
        span({ class: 'mono' }, 'matchBlock'),
        ' after the ',
        span({ class: 'mono' }, 'pendingBlock'),
        ' has shown the connection state.',
      ]),
    ]),
);

export default EffectFunctionComponent;
