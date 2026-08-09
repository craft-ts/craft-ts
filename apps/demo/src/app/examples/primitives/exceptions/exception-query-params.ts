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
  craftComputed,
  craftMethod,
  CraftRouter,
  queryParams,
  craftException,
} from '@craft-ng/core';

const ExceptionQueryParamsComponent = craftComponent(
  'ExceptionQueryParamsComponent',
  {},
  function* () {
    const router = yield* CraftRouter(undefined, ({ navigate }) => ({
      navigate,
    }));
    const modeQueryParams = yield* queryParams('modeQueryParams', {
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
    });
    const navigate = craftMethod('navigate', function* (mode: string) {
      void router.navigate({
        to: 'exception-query-params',
        //@ts-expect-error intentional to demonstrate the example
        queryParams: { mode },
        queryParamsHandling: 'merge',
      });
    });
    const hasParseException = craftComputed(
      'hasParseException',
      () => modeQueryParams.exceptions().parse.mode !== undefined,
    );
    return { modeQueryParams, navigate, hasParseException };
  },
  ({ modeQueryParams, navigate, hasParseException }) => {
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
      p([strong('Parsed value: '), String(modeQueryParams().mode)]),
      ifBlock(
        hasParseException,
        () => {
          const exception = modeQueryParams.exceptions().parse.mode as {
            code: string;
            payload: { error: unknown };
          };
          return p([
            strong('Exception: '),
            `${exception.code}: ${exception.payload.error}`,
          ]);
        },
        () => p([strong('Exception: '), 'none']),
      ),
    ]);
  },
);

export default ExceptionQueryParamsComponent;
