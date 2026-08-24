import {
  assertExhaustiveRouteExceptions,
  craftRoutes,
  type CanRun,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';

type ClientOnlyPage = typeof import('./pages/client-only-page').ClientOnlyPage;
type DataPage = typeof import('./pages/data-page').DataPage;
type FallbackPage = typeof import('./pages/fallback-page').FallbackPage;
type NotFoundPage = typeof import('./pages/not-found-page').NotFoundPage;
type OverviewPage = typeof import('./pages/overview-page').OverviewPage;
type RequestPage = typeof import('./pages/request-page').RequestPage;
type StaticPage = typeof import('./pages/static-page').StaticPage;

export const { ssrRoutes } = craftRoutes('ssr', [
  {
    path: '',
    componentDeps: {} as ComponentDepsOf<OverviewPage>,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./pages/overview-page')).then(
        ({ OverviewPage }) => OverviewPage,
      ),
    ssr: { mode: 'block' },
  },
  {
    path: 'static',
    componentDeps: {} as ComponentDepsOf<StaticPage>,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./pages/static-page')).then(
        ({ StaticPage }) => StaticPage,
      ),
    ssr: { mode: 'block' },
  },
  {
    path: 'request',
    componentDeps: {} as ComponentDepsOf<RequestPage>,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./pages/request-page')).then(
        ({ RequestPage }) => RequestPage,
      ),
    ssr: { mode: 'block' },
  },
  {
    path: 'data',
    componentDeps: {} as ComponentDepsOf<DataPage>,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./pages/data-page')).then(({ DataPage }) => DataPage),
    ssr: { mode: 'block' },
  },
  {
    path: 'fallback',
    componentDeps: {} as ComponentDepsOf<FallbackPage>,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./pages/fallback-page')).then(
        ({ FallbackPage }) => FallbackPage,
      ),
    ssr: { mode: 'fallback' },
  },
  {
    path: 'client-only',
    componentDeps: {} as ComponentDepsOf<ClientOnlyPage>,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./pages/client-only-page')).then(
        ({ ClientOnlyPage }) => ClientOnlyPage,
      ),
    ssr: { mode: 'client' },
  },
  {
    path: '**',
    componentDeps: {} as ComponentDepsOf<NotFoundPage>,
    loadComponent: ({ withRetry }) =>
      withRetry(import('./pages/not-found-page')).then(
        ({ NotFoundPage }) => NotFoundPage,
      ),
    ssr: { mode: 'block' },
  },
]);

assertExhaustiveRouteExceptions(ssrRoutes);

type SsrRouteCheckedDI<Component, Context extends string> = RouteCheckedDI<
  ComponentDepsOf<Component>,
  'CraftRouter' | 'CraftActivatedRoute',
  never,
  Context
>;

type _CanRunOverview = CanRun<
  SsrRouteCheckedDI<OverviewPage, 'path: ""'>
>;
type _CanRunStatic = CanRun<
  SsrRouteCheckedDI<StaticPage, 'path: "static"'>
>;
type _CanRunRequest = CanRun<
  SsrRouteCheckedDI<RequestPage, 'path: "request"'>
>;
type _CanRunData = CanRun<SsrRouteCheckedDI<DataPage, 'path: "data"'>>;
type _CanRunFallback = CanRun<
  SsrRouteCheckedDI<FallbackPage, 'path: "fallback"'>
>;
type _CanRunClientOnly = CanRun<
  SsrRouteCheckedDI<ClientOnlyPage, 'path: "client-only"'>
>;
type _CanRunNotFound = CanRun<
  SsrRouteCheckedDI<NotFoundPage, 'path: "**"'>
>;
