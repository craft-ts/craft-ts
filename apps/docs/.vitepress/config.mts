import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: '@craft-ng/core',
  base: '/craft/',
  description: '@craft-ng/core is a reactive state management tool for Angular',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/assets/favicon.png',
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: 'Rechercher',
            buttonAriaLabel: 'Rechercher dans la documentation',
          },
          modal: {
            noResultsText: 'Aucun resultat',
            resetButtonTitle: 'Effacer la recherche',
            footer: {
              selectText: 'Selectionner',
              navigateText: 'Naviguer',
              closeText: 'Fermer',
            },
          },
        },
      },
    },
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
        text: 'Service',
        items: [
          { text: 'craftService', link: '/store/craft-service' },
          { text: 'toCraftService', link: '/store/to-craft-service' },
          {
            text: 'setupCraftServiceTestingByRegister',
            link: '/store/setup-craft-service-testing-by-register',
          },
        ],
      },
      {
        text: 'Utils',
        items: [
          { text: 'craftMethod', link: '/utils/craft-method' },
          { text: 'craftComputed', link: '/utils/craft-computed' },
          { text: 'craftEffect', link: '/utils/craft-effect' },
          { text: 'source$', link: '/utils/source$' },
          { text: 'fromEventToSource$', link: '/utils/from-event-to-source$' },
          { text: 'on$', link: '/utils/on$' },
          { text: 'onAppStart', link: '/utils/on-app-start' },
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
        text: 'Type-safe DI/Routes',
        items: [
          {
            text: 'Setup',
            link: '/type-safe-di-routes/setup',
          },
          {
            text: 'Route Providers',
            link: '/type-safe-di-routes/route-providers',
          },
          {
            text: 'Browser Boundaries',
            link: '/type-safe-di-routes/browser-boundaries',
          },
          {
            text: 'Angular Brand Config',
            link: '/type-safe-di-routes/angular-brand-config',
          },
          {
            text: 'Observability',
            link: '/type-safe-di-routes/observability',
          },
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
