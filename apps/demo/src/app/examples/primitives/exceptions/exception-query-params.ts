import { computed } from '@angular/core';
import {
  button,
  craftComponent,
  div,
  h,
  ifBlock,
  p,
  section,
  strong,
} from '@craft-ng/component';
import {
  craftMethod,
  CraftRouter,
  queryParams,
  craftException, craftUse } from '@craft-ng/core';

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
                    { code: 'UNEXPECTED_ERROR' },
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
        hasParseException: computed(
          () => craftUse(exceptions()).parse.mode !== undefined,
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
      h('h4', 'QueryParams decode exception'),
      div([
        button(
          {
            *click() {
              yield* navigate('success');
            },
          },
          'Navigate success',
        ),
        button(
          {
            *click() {
              yield* navigate('exception');
            },
          },
          'Navigate exception',
        ),
      ]),
      p([
        strong('Parsed value: '),
        () => String(craftUse(modeQueryParams()).mode),
      ]),
      ifBlock(
        modeQueryParams.hasParseException,
        () =>
          p([
            strong('Exception: '),
            () => {
              const exception = craftUse(
                modeQueryParams.exceptions(),
              ).parse.mode as {
                code: string;
                payload: { error: unknown };
              };
              return `${exception.code}: ${exception.payload.error}`;
            },
          ]),
        () => p([strong('Exception: '), 'none']),
      ),
    ]);
  },
);

export default ExceptionQueryParamsComponent;
