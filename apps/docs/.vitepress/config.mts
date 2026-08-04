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
        text: 'Migration',
        link: '/migration',
      },
      {
        text: 'Primitives',
        items: [
          { text: 'state', link: '/primitives/state' },
          { text: 'asyncProcess', link: '/primitives/async-process' },
          { text: 'queryParams', link: '/primitives/query-params' },
          { text: 'query', link: '/primitives/query' },
          { text: 'mutation', link: '/primitives/mutation' },
        ],
      },
      {
        text: 'Insertions',
        items: [
          {
            text: 'craftPipe',
            link: '/insertions/craft-pipe',
          },
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
        text: 'Component',
        items: [
          {
            text: 'Directives et .pipe(...)',
            link: '/component/directives',
          },
          {
            text: 'Customize components and directives',
            link: '/component/customization',
          },
          {
            text: 'Content projection and typed fragments',
            link: '/component/content-projection',
          },
          {
            text: 'Styles encapsulés',
            link: '/component/styles',
          },
        ],
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
          { text: 'craftRegisterFor', link: '/utils/craft-register-for' },
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
            text: 'Automation',
            link: '/type-safe-di-routes/automation',
          },
          {
            text: 'Route Providers',
            link: '/type-safe-di-routes/route-providers',
          },
          {
            text: 'craftGen',
            link: '/type-safe-di-routes/craft-gen',
          },
          {
            text: 'Program Operators (.pipe)',
            link: '/type-safe-di-routes/program-operators',
          },
          {
            text: 'Pattern Matching (craftMatch)',
            link: '/type-safe-di-routes/pattern-matching',
          },
          {
            text: 'Route Guards',
            link: '/type-safe-di-routes/guards',
          },
          {
            text: 'Route Load Errors',
            link: '/type-safe-di-routes/route-load-errors',
          },
          {
            text: 'Lazy Services (craftLazy)',
            link: '/type-safe-di-routes/lazy-services',
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
