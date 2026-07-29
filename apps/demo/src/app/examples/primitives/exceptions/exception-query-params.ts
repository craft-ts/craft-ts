import {
  ActivatedRoute as ActivatedRouteToken,
  Router as RouterToken,
} from '@angular/router';
import {
  button,
  craftComponent,
  div,
  h,
  p,
  section,
  strong,
} from '@craft-ng/component';
import {
  componentMonitoring,
  provideHostName,
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
  { providers: [provideHostName('component:ExceptionQueryParamsComponent')] },
  function* () {
    componentMonitoring();
    const router = yield* Router(undefined, ({ navigate }) => ({
      navigate,
    }));
    const activatedRoute = yield* ActivatedRoute();
    const { modeQueryParams } = yield* queryParams('modeQueryParams', {
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
    return { modeQueryParams, navigate };
  },
  ({ modeQueryParams, navigate }) => {
    const exception = modeQueryParams.exceptions().parse.mode;
    return section([
      h('h4', 'QueryParams decode exception'),
      div([
        button({ click: () => navigate('success') }, 'Navigate success'),
        button({ click: () => navigate('exception') }, 'Navigate exception'),
      ]),
      p([strong('Parsed value: '), modeQueryParams.mode()]),
      exception
        ? p([
            strong('Exception: '),
            `${exception.code}: ${String(exception.payload.error)}`,
          ])
        : p([strong('Exception: '), 'none']),
    ]);
  },
);

export default ExceptionQueryParamsComponent;
