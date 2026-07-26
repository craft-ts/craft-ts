import { ActivatedRoute, Router } from '@angular/router';
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
  craftException,
  provideHostName,
  queryParams,
  toCraftService,
} from '@craft-ng/core';

const { ActivatedRouteToYield } = toCraftService({
  name: 'ActivatedRoute',
  scope: 'global',
  token: ActivatedRoute,
});
const { RouterToYield } = toCraftService({
  name: 'Router',
  scope: 'global',
  token: Router,
});

const ExceptionQueryParamsComponent = craftComponent(
  'ExceptionQueryParamsComponent',
  { providers: [provideHostName('component:ExceptionQueryParamsComponent')] },
  function* () {
    componentMonitoring();
    const router = yield* RouterToYield(undefined, ({ navigate }) => ({
      navigate,
    }));
    const activatedRoute = yield* ActivatedRouteToYield();
    const modeQueryParams = yield* queryParams({
      state: {
        mode: {
          fallbackValue: 'fallbackValue' as const,
          parse: (value: string) =>
            value === 'success'
              ? ('success' as const)
              : craftException(
                  { code: 'InvalidModeFromUrl' },
                  { received: value },
                ),
          serialize: String,
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
      h('h4', 'QueryParams parse exception'),
      div([
        button({ click: () => navigate('success') }, 'Navigate success'),
        button({ click: () => navigate('exception') }, 'Navigate exception'),
      ]),
      p([strong('Parsed value: '), modeQueryParams.mode()]),
      exception
        ? p([
            strong('Exception: '),
            `${exception.code} (received: ${exception.payload.received})`,
          ])
        : p([strong('Exception: '), 'none']),
    ]);
  },
);

export default ExceptionQueryParamsComponent;
