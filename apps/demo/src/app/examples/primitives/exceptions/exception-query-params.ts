import {
  ActivatedRoute as ActivatedRouteToken,
  Router as RouterToken,
} from '@angular/router';
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
  queryParams,
  toCraftService,
} from '@craft-ng/core';

const { ActivatedRoute } = toCraftService({
  name: 'ActivatedRoute',
  scope: 'global',
  token: ActivatedRouteToken,
});
const { Router } = toCraftService({
  name: 'Router',
  scope: 'global',
  token: RouterToken,
});

const ExceptionQueryParamsComponent = craftComponent(
  'ExceptionQueryParamsComponent',
  {},
  function* () {
    const router = yield* Router(undefined, ({ navigate }) => ({
      navigate,
    }));
    const activatedRoute = yield* ActivatedRoute();
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
    const navigate = (mode: string) =>
      void router.navigate([], {
        relativeTo: activatedRoute,
        queryParams: { mode },
        queryParamsHandling: 'merge',
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
            `${exception.code}: ${String(exception.payload.error)}`,
          ]);
        },
        () => p([strong('Exception: '), 'none']),
      ),
    ]);
  },
);

export default ExceptionQueryParamsComponent;
