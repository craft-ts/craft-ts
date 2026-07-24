import { ActivatedRoute, Router } from '@angular/router';
import {
  button,
  component,
  div,
  h,
  p,
  section,
  strong,
} from '@craft-ng/component';
import {
  componentMonitoring,
  craftException,
  craftUse,
  provideHostName,
  queryParams,
  toCraftService,
  type GetDeps,
} from '@craft-ng/core';

const { injectActivatedRoute } = toCraftService({
  name: 'ActivatedRoute',
  scope: 'global',
  token: ActivatedRoute,
});
const { injectRouter } = toCraftService({
  name: 'Router',
  scope: 'global',
  token: Router,
});

const ExceptionQueryParamsComponent = component(
  { providers: [provideHostName('component:ExceptionQueryParamsComponent')] },
  () => {
    componentMonitoring();
    const router = injectRouter(undefined, ({ navigate }) => ({ navigate }));
    const activatedRoute = injectActivatedRoute();
    const modeQueryParams = craftUse(
      queryParams({
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
      }),
    );
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
export type GenDeps_ExceptionQueryParamsComponent = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
  missingProvider: {
    Router: Router;
    ActivatedRoute: ActivatedRoute;
  };
}>;
