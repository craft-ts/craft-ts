import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: '@craft-ng/core',
  base: '/craft/',
  description: '@craft-ng/core is a reactive state management tool for Angular',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/assets/favicon.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/get-started' },
    ],

    sidebar: [
      {
        text: 'Get Started',
        link: '/get-started',
      },
      {
        text: 'Introduction',
        link: '/introduction',
      },
      {
        text: 'Primitives',
        items: [
          { text: 'state', link: '/primitives/state' },
          { text: 'AsyncProcess', link: '/primitives/async-process' },
          { text: 'queryParam', link: '/primitives/query-param' },
          { text: 'query', link: '/primitives/query' },
          { text: 'mutation', link: '/primitives/mutation' },
        ],
      },
      {
        text: 'Insertions',
        items: [
          {
            text: 'insertSelect',
            link: '/insertions/insert-select',
          },
          {
            text: 'insertLocalStorage',
            link: '/insertions/insert-local-storage',
          },
          {
            text: 'insertReactOnMutation',
            link: '/insertions/insert-react-on-mutation',
          },
          {
            text: 'insertEntities',
            link: '/insertions/insert-entities',
          },
          {
            text: 'insertPaginationPlaceholderData',
            link: '/insertions/insert-pagination-placeholder-data',
          },
        ],
      },
      {
        text: 'Forms',
        items: [{ text: 'Overview', link: '/forms/index' }],
      },
      {
        text: 'Store',
        items: [
          { text: 'craft', link: '/store/craft' },
          { text: 'craftService', link: '/store/craft-service' },
          { text: 'toCraftService', link: '/store/to-craft-service' },
          { text: 'craftState', link: '/store/craft-state' },
          { text: 'craftSources', link: '/store/craft-sources' },
          { text: 'craftInputs', link: '/store/craft-inputs' },
          { text: 'craftComputedStates', link: '/store/craft-computed' },
          { text: 'craftAsyncProcesses', link: '/store/craft-async-process' },
          { text: 'craftQuery', link: '/store/craft-query' },
          { text: 'craftQueryParam', link: '/store/craft-query-param' },
          { text: 'craftQueryParams', link: '/store/craft-query-params' },
          { text: 'craftMutations', link: '/store/craft-mutation' },
          {
            text: 'craftSetAllQueriesParamsStandalone',
            link: '/store/craft-set-all-queries-params-standalone',
          },
          { text: 'craftInject', link: '/store/craft-inject' },
          {
            text: 'setupCraftServiceTestingByRegister',
            link: '/store/setup-craft-service-testing-by-register',
          },
        ],
      },
      {
        text: 'Utils',
        items: [
          { text: 'source$', link: '/utils/source$' },
          { text: 'fromEventToSource$', link: '/utils/from-event-to-source$' },
          { text: 'on$', link: '/utils/on$' },
          { text: 'injectService', link: '/utils/inject-service' },
          {
            text: 'reactiveWritableSignal',
            link: '/utils/reactive-writable-signal',
          },
          {
            text: 'GlobalPersisterHandler',
            link: '/utils/global-persister-handler-service',
          },
          { text: 'Entities Utilities', link: '/utils/entities-util' },
        ],
      },
      {
        text: 'Examples',
        link: '/examples',
      },
      {
        text: 'Press kit',
        link: '/press-kit',
      },
      {
        text: 'Backlog',
        link: '/backlog',
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ng-angular-stack/ng-craft' },
    ],
  },
  head: [
    ['link', { rel: 'icon', href: '/assets/favicon.png', type: 'image/png' }],
  ],
});
