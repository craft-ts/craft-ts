import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: '@ngcraft',
  base: '/craft/',
  description: '@ngcraft is a reactive state management tool for Angular',
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
          { text: 'asyncMethod', link: '/primitives/async-method' },
          { text: 'queryParam', link: '/primitives/query-param' },
          { text: 'query', link: '/primitives/query' },
          { text: 'mutation', link: '/primitives/mutation' },
        ],
      },
      {
        text: 'Insertions',
        items: [
          {
            text: 'insertLocalStorage',
            link: '/insertions/insert-local-storage',
          },
          {
            text: 'insertReactOnMutation',
            link: '/insertions/insert-react-on-mutation',
          },
        ],
      },
      {
        text: 'Store',
        items: [
          { text: 'craft', link: '/store/craft' },
          { text: 'craftState', link: '/store/craft-state' },
          { text: 'craftSources', link: '/store/craft-sources' },
          { text: 'craftInputs', link: '/store/craft-inputs' },
          { text: 'craftComputedStates', link: '/store/craft-computed' },
          { text: 'craftAsyncMethods', link: '/store/craft-async-method' },
          { text: 'craftQuery', link: '/store/craft-query' },
          { text: 'craftQueryParam', link: '/store/craft-query-param' },
          { text: 'craftQueryParams', link: '/store/craft-query-params' },
          { text: 'craftMutations', link: '/store/craft-mutation' },
          {
            text: 'craftSetAllQueriesParamsStandalone',
            link: '/store/craft-set-all-queries-params-standalone',
          },
          { text: 'craftInject', link: '/store/craft-inject' },
        ],
      },
      {
        text: 'Utils',
        items: [
          { text: 'Source', link: '/utils/source' },
          { text: 'toSource', link: '/utils/to-source' },
          { text: 'stackedSource', link: '/utils/stacked-source' },
          { text: 'sourceFromEvent', link: '/utils/source-from-event' },
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
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/ng-angular-stack/ng-craft' },
    ],
  },
  head: [
    ['link', { rel: 'icon', href: '/assets/favicon.png', type: 'image/png' }],
  ],
});
