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
            decode: (value: string) => {
              if (value !== 'success') {
                throw new Error(`Invalid mode: ${value}`);
              }
              return 'success' as const;
            },
            encode: String,
          },
        },
      },
    });
    const navigate = craftMethod('navigate', function* (mode: string) {
      void router.navigate({
        to: 'exception-query-params',
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
        button({ click: () => navigate('success') }, 'Navigate success'),
        button({ click: () => navigate('exception') }, 'Navigate exception'),
      ]),
      p([strong('Parsed value: '), modeQueryParams.mode()]),
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
