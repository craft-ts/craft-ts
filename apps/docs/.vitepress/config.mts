import { defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';

const learnSidebar = [
  {
    text: 'Learn',
    items: [
      { text: 'Overview', link: '/learn/' },
      { text: '1. Your first state', link: '/learn/01-first-state' },
      { text: '2. Derive instead of duplicate', link: '/learn/02-derive' },
      { text: '3. Move logic out of the component', link: '/learn/03-service' },
      { text: '4. Compose services', link: '/learn/04-compose' },
      { text: '5. Load server data', link: '/learn/05-load-data' },
      { text: '6. Write server data', link: '/learn/06-mutate-data' },
      { text: '7. Put state in the URL', link: '/learn/07-url-state' },
      { text: '8. Build a form', link: '/learn/08-forms' },
      { text: '9. Wire up routing', link: '/learn/09-routing' },
      { text: '10. Test what you wrote', link: '/learn/10-testing' },
      { text: 'Where to go next', link: '/learn/next' },
    ],
  },
];

const guideSidebar = [
  { text: 'Guide overview', link: '/guide/' },
  {
    text: 'Core concepts',
    collapsed: false,
    items: [
      { text: 'The mental model', link: '/guide/concepts/mental-model' },
      {
        text: 'What craft adds to Angular',
        link: '/guide/concepts/vs-angular',
      },
      {
        text: 'Which primitive should I use?',
        link: '/guide/concepts/choose-primitive',
      },
      {
        text: 'Anatomy of a primitive',
        link: '/guide/concepts/primitive-anatomy',
      },
      { text: 'Generators and yield*', link: '/guide/concepts/generators' },
      { text: 'Insertions', link: '/guide/concepts/insertions' },
      {
        text: 'Typed insertion pipes',
        link: '/guide/concepts/insertion-pipes',
      },
      { text: 'Exceptions as values', link: '/guide/concepts/exceptions' },
    ],
  },
  {
    text: 'Managing state',
    collapsed: false,
    items: [
      { text: 'Local state', link: '/guide/state/local-state' },
      { text: 'query', link: '/guide/state/server-state' },
      { text: 'Mutations', link: '/guide/state/mutations' },
      { text: 'queryParams', link: '/guide/state/url-state' },
      { text: 'asyncProcess', link: '/guide/state/async-process' },
      { text: 'Selecting', link: '/guide/state/select' },
      { text: 'Reacting to mutations', link: '/guide/state/react-on-mutation' },
      { text: 'Collections', link: '/guide/state/collections' },
      { text: 'Collection utilities', link: '/guide/state/collections-utils' },
      { text: 'Persistence', link: '/guide/state/persistence' },
      {
        text: 'GlobalPersisterHandler',
        link: '/guide/state/persistence-handler',
      },
      {
        text: 'Pagination placeholders',
        link: '/guide/state/pagination-placeholder',
      },
      { text: 'Schema validation', link: '/guide/state/schema-validation' },
    ],
  },
  {
    text: 'Recommended approaches',
    collapsed: false,
    items: [
      {
        text: 'Inject at the point of use',
        link: '/guide/patterns/inject-at-point-of-use',
      },
    ],
  },
  {
    text: 'Structuring the app',
    collapsed: true,
    items: [
      { text: 'craftService', link: '/guide/app/craft-service' },
      { text: 'Service scopes', link: '/guide/app/service-scopes' },
      { text: 'Shaping the public API', link: '/guide/app/expose-api' },
      { text: 'Abstract services', link: '/guide/app/abstract-services' },
      {
        text: 'Integrating existing code',
        link: '/guide/app/integrate-existing',
      },
      { text: 'App start', link: '/guide/app/app-start' },
      { text: 'Lazy services', link: '/guide/app/lazy-services' },
      { text: 'craftRegisterFor', link: '/guide/app/register' },
      { text: 'Target wrapper', link: '/guide/app/target-wrapper' },
    ],
  },
  {
    text: 'Routing & type-safe DI',
    collapsed: true,
    items: [
      { text: 'Setup', link: '/guide/routing/setup' },
      { text: 'CLI automation', link: '/guide/routing/automation' },
      { text: 'ESLint rules', link: '/guide/routing/eslint-rules' },
      { text: 'Route providers', link: '/guide/routing/route-providers' },
      { text: 'Route guards', link: '/guide/routing/guards' },
      {
        text: 'Route exception handling',
        link: '/guide/routing/exception-handling',
      },
      { text: 'Non-blocking navigation', link: '/guide/routing/pending-ui' },
      {
        text: 'Global error component',
        link: '/guide/routing/global-error-component',
      },
      { text: 'Route load errors', link: '/guide/routing/route-load-errors' },
      { text: 'Scaling routes', link: '/guide/routing/scaling' },
      {
        text: 'Angular brand config',
        link: '/guide/routing/angular-brand-config',
      },
    ],
  },
  {
    text: 'Components & templates',
    collapsed: false,
    items: [
      { text: 'Components', link: '/guide/components/' },
      {
        text: 'Fine-grained reactivity',
        link: '/guide/components/fine-grained-reactivity',
      },
      {
        text: 'Directives and .pipe(...)',
        link: '/guide/components/directives',
      },
      {
        text: 'settledValue & pendingBlock',
        link: '/guide/components/pending-block',
      },
      { text: 'Accessibility', link: '/guide/components/accessibility' },
      { text: 'Customization', link: '/guide/components/customization' },
      {
        text: 'Content projection',
        link: '/guide/components/content-projection',
      },
      { text: 'Encapsulated styles', link: '/guide/components/styles' },
      {
        text: 'Template migrator',
        link: '/guide/components/template-migrator',
      },
    ],
  },
  {
    text: 'Forms',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/guide/forms/' },
      { text: 'Validators', link: '/guide/forms/validation' },
      { text: 'Submitting', link: '/guide/forms/submit' },
      { text: 'Nested forms', link: '/guide/forms/nested' },
      { text: 'Exception handling', link: '/guide/forms/exceptions' },
      { text: 'Complete examples', link: '/guide/forms/examples' },
    ],
  },
  {
    text: 'Testing',
    collapsed: true,
    items: [
      { text: 'Testing services', link: '/guide/testing/services' },
      { text: 'Testing components', link: '/guide/testing/components' },
      { text: 'Type-level tests', link: '/guide/testing/type-level' },
      { text: 'Browser boundaries', link: '/guide/testing/browser-boundaries' },
      { text: 'Architecture rules', link: '/guide/testing/architecture' },
      { text: 'Craft graph vs Nx', link: '/guide/testing/craft-graph-vs-nx' },
    ],
  },
  {
    text: 'Reactivity utilities',
    collapsed: true,
    items: [
      { text: 'craftComputed', link: '/guide/reactivity/craft-computed' },
      { text: 'craftEffect', link: '/guide/reactivity/craft-effect' },
      { text: 'craftMethod', link: '/guide/reactivity/craft-method' },
      { text: 'source$', link: '/guide/reactivity/source' },
      { text: 'on$', link: '/guide/reactivity/on' },
      {
        text: 'fromEventToSource$',
        link: '/guide/reactivity/from-event-to-source',
      },
      { text: 'sourceFromEvent', link: '/guide/reactivity/source-from-event' },
      {
        text: 'afterRecomputation',
        link: '/guide/reactivity/after-recomputation',
      },
    ],
  },
  {
    text: 'Going further',
    collapsed: true,
    items: [
      { text: 'Program operators', link: '/guide/advanced/program-operators' },
      { text: 'Pattern matching', link: '/guide/advanced/pattern-matching' },
      { text: 'Observability', link: '/guide/advanced/observability' },
      { text: 'Live page MCP', link: '/guide/ai/dev-page' },
      { text: 'Temporal runtime', link: '/guide/advanced/temporal-runtime' },
    ],
  },
];

const resourcesSidebar = [
  {
    text: 'Resources',
    items: [
      { text: 'Examples', link: '/resources/examples' },
      { text: 'Coding agents', link: '/resources/ai-agents' },
      { text: 'Migration', link: '/resources/migration' },
      { text: 'Press kit', link: '/resources/press-kit' },
      { text: 'Roadmap', link: '/resources/roadmap' },
      { text: 'Backlog', link: '/resources/backlog' },
    ],
  },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: '@craft-ts/core',
  base: '/craft/',
  description: 'Type-safe Angular, by construction',
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
      { text: 'Learn', link: '/learn/', activeMatch: '^/learn/' },
      { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
      { text: 'Reference', link: '/reference/', activeMatch: '^/reference/' },
      {
        text: 'Packages',
        items: [
          {
            text: '@craft-ts/core',
            link: 'https://www.npmjs.com/package/@craft-ts/core',
          },
          {
            text: '@craft-ts/component',
            link: 'https://www.npmjs.com/package/@craft-ts/component',
          },
          {
            text: '@craft-ts/dev-tools',
            link: 'https://www.npmjs.com/package/@craft-ts/dev-tools',
          },
          {
            text: '@craft-ts/mcp',
            link: 'https://www.npmjs.com/package/@craft-ts/mcp',
          },
        ],
      },
      {
        text: 'Resources',
        activeMatch: '^/resources/',
        items: [
          { text: 'Examples', link: '/resources/examples' },
          { text: 'Coding agents', link: '/resources/ai-agents' },
          { text: 'Migration', link: '/resources/migration' },
          { text: 'Press kit', link: '/resources/press-kit' },
          { text: 'Roadmap', link: '/resources/roadmap' },
          { text: 'Backlog', link: '/resources/backlog' },
        ],
      },
    ],

    sidebar: {
      '/learn/': learnSidebar,
      '/guide/': guideSidebar,
      '/reference/': [
        {
          text: 'Reference',
          items: [{ text: 'API index', link: '/reference/' }],
        },
      ],
      '/resources/': resourcesSidebar,
    },

    outline: [2, 3],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/craft-ts/craft-ts' },
    ],
  },
  head: [
    ['link', { rel: 'icon', href: '/assets/favicon.png', type: 'image/png' }],
    [
      'link',
      {
        rel: 'describedby',
        href: 'https://craft-ts.github.io/craft/llms.txt',
      },
    ],
  ],
  vite: {
    plugins: [
      llmstxt({
        title: '@craft-ts/core',
        description:
          'Type-safe Angular. Declare. Yield. Derive. Compile — no surprises. Coding agents should start here, then follow linked markdown pages or use the @craft-ts/mcp server. The architecture/ suite is the graph contract — scaffold at bootstrap, run during a feature, encode a smell so it cannot recur.',
        details:
          'After importing @craft-ts/core, run `npx -y @craft-ts/mcp@beta` and read /resources/ai-agents. In local development, the open ng serve tab is driven by the function-registry MCP tool `page` — see /guide/ai/dev-page. yield* every Craft reader. Scaffold architecture/ at bootstrap and run it during a feature; do not add an architecture rule for the feature. Do not generate Angular signal(), inject(), or @Injectable in authored Craft code.',
        domain: 'https://craft-ts.github.io',
        ignoreFiles: ['public/**', 'README.md'],
      }),
    ],
  },
});
