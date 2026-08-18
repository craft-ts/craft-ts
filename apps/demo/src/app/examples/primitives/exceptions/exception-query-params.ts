/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  craftComponent,
  div,
  ifBlock,
  p,
  section,
  strong,
  heading,
} from '@craft-ts/component';
import {
  craftMethod,
  CraftRouter,
  queryParams,
  craftComputed,
  craftException,
} from '@craft-ts/core';

function formatParseException(exception: {
  _tag: string;
  payload: { error: unknown };
}) {
  return `${exception._tag}: ${exception.payload.error}`;
}

const ExceptionQueryParamsComponent = craftComponent(
  'ExceptionQueryParamsComponent',
  {
    styles: `
      :scope {
        display: block;
        max-width: 620px;
        margin: 2rem auto;
        padding: 1.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        color: #1e293b;
        background: #f8fafc;
      }
      :scope h4 { margin: 0 0 1rem; color: #0f172a; }
      :scope > div {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }
      :scope button {
        padding: 0.5rem 0.9rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        color: #334155;
        background: #fff;
        cursor: pointer;
      }
      :scope button:hover { background: #f1f5f9; }
      :scope p { margin: 0.5rem 0; }
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const modeQueryParams = yield* queryParams(
      'modeQueryParams',
      {
        state: {
          mode: {
            fallbackValue: 'fallbackValue' as const,
            codec: {
              // The runtime accepts a CraftException as a decode result and
              // records it in `exceptions().parse`; the cast keeps the public
              // decoded state limited to the successful domain value.
              decode: ((value: string) => {
                if (value !== 'success') {
                  return craftException(
                    { _tag: 'UNEXPECTED_ERROR' },
                    { error: new Error(`Invalid mode: ${value}`) },
                  );
                }
                return 'success' as const;
              }) as (value: string) => 'success' | 'fallbackValue',
              encode: String,
            },
          },
        },
      },
      ({ exceptions }) => ({
        hasParseException: craftComputed(
          'hasParseException',
          function* () {
            return (yield* exceptions()).parse.mode !== undefined;
          },
        ),
      }),
    );
    const navigate = craftMethod('navigate', function* (mode: string) {
      void router.navigate({
        to: 'exception-query-params',
        //@ts-expect-error intentional to demonstrate the example
        queryParams: { mode },
        queryParamsHandling: 'merge',
      });
    });
    return { modeQueryParams, navigate };
  },
  ({ modeQueryParams, navigate }) => {
    return section([
      heading( 'QueryParams decode exception'),
      div([
        button('success',
          { type: 'button',
            *click() {
              yield* navigate('success');
            },
          },
          'Navigate success',
        ),
        button('exception',
          { type: 'button',
            *click() {
              yield* navigate('exception');
            },
          },
          'Navigate exception',
        ),
      ]),
      p([
        strong('Parsed value: '),
        function* () {
          return String((yield* modeQueryParams()).mode);
        },
      ]),
      ifBlock(
        modeQueryParams.hasParseException,
        () =>
          p([
            strong('Exception: '),
            function* () {
              return formatParseException(
                (yield* modeQueryParams.exceptions()).parse.mode as {
                  _tag: string;
                  payload: { error: unknown };
                },
              );
            },
          ]),
        () => p([strong('Exception: '), 'none']),
      ),
    ]);
  },
);

export default ExceptionQueryParamsComponent;
