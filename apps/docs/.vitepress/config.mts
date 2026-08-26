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

const learnEffectSidebar = [
  {
    text: 'Learn with Effect',
    items: [
      {
        text: 'Effect users: start here',
        link: '/learn-effect/00-start-here',
      },
      { text: 'Overview', link: '/learn-effect/' },
      {
        text: '1. Start with a Craft component',
        link: '/learn-effect/01-first-component',
      },
      { text: '2. Derive UI state', link: '/learn-effect/02-derive' },
      {
        text: '3. Put the domain in Effect',
        link: '/learn-effect/03-effect-domain',
      },
      {
        text: '4. Load data with Effect',
        link: '/learn-effect/04-load-data',
      },
      {
        text: '5. Write data with Effect',
        link: '/learn-effect/05-write-data',
      },
      {
        text: '6. Provide Layers and route the app',
        link: '/learn-effect/06-layers-routing',
      },
      {
        text: '7. Build forms and validate boundaries',
        link: '/learn-effect/07-forms-validation',
      },
      { text: '8. Test the graph', link: '/learn-effect/08-testing' },
      {
        text: '9. Server functions — POC',
        link: '/learn-effect/09-server-functions',
      },
    ],
  },
];

const guideSidebar = [
  { text: 'Guide overview', link: '/guide/' },
  { text: 'Create a project', link: '/guide/create-project' },
  {
    text: 'Core concepts',
    collapsed: false,
    items: [
      { text: 'The mental model', link: '/guide/concepts/mental-model' },
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
    ],
  },
  {
    text: 'Components & templates',
    collapsed: false,
    items: [
      { text: 'Components', link: '/guide/components/' },
      { text: 'Activating the style system', link: '/guide/style/setup' },
      { text: 'Typed styles', link: '/guide/style/' },
      { text: 'Defining a design system', link: '/guide/style/define' },
      { text: 'Tokens and variables', link: '/guide/style/tokens' },
      { text: 'Axes and the matrix', link: '/guide/style/variants' },
      { text: 'Context obligations', link: '/guide/style/obligations' },
      { text: 'Testing visual states', link: '/guide/style/testing' },
      {
        text: 'Component CSS variables',
        link: '/guide/components/css-variables',
      },
      {
        text: 'Fine-grained reactivity',
        link: '/guide/components/fine-grained-reactivity',
      },
      {
        text: 'Progressive rendering',
        link: '/guide/components/schedule-for',
      },
      {
        text: 'Directives and .pipe(...)',
        link: '/guide/components/directives',
      },
      {
        text: 'settledValue & pendingNode',
        link: '/guide/components/pending-node',
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
      {
        text: 'Architecture rules',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/guide/testing/architecture' },
          {
            text: 'Declarative baseline',
            link: '/guide/testing/architecture/declarative-baseline',
          },
          {
            text: 'Unique identities',
            link: '/guide/testing/architecture/unique-identities',
          },
          {
            text: 'HTTP endpoint ownership',
            link: '/guide/testing/architecture/http-endpoint-ownership',
          },
          {
            text: 'Computed purity',
            link: '/guide/testing/architecture/computed-purity',
          },
          {
            text: 'Dependency cycles',
            link: '/guide/testing/architecture/dependency-cycles',
          },
          {
            text: 'Mutation reactions',
            link: '/guide/testing/architecture/mutation-reactions',
          },
          {
            text: 'Route DI proofs',
            link: '/guide/testing/architecture/route-di-proofs',
          },
          {
            text: 'Route component files',
            link: '/guide/testing/architecture/route-component-files',
          },
          {
            text: 'Path boundaries',
            link: '/guide/testing/architecture/path-boundaries',
          },
          {
            text: 'Exclusive links',
            link: '/guide/testing/architecture/exclusive-links',
          },
          {
            text: 'Persisted identities',
            link: '/guide/testing/architecture/persisted-identities',
          },
          {
            text: 'insertSelect keys',
            link: '/guide/testing/architecture/insert-select-keys',
          },
          {
            text: 'craftEffect and network',
            link: '/guide/testing/architecture/craft-effect-network',
          },
          {
            text: 'craftEffect and imperative sync',
            link: '/guide/testing/architecture/craft-effect-imperative-sync',
          },
          {
            text: 'Interactive element names',
            link: '/guide/testing/architecture/interactive-element-names',
          },
          {
            text: 'Server-state loaders',
            link: '/guide/testing/architecture/server-state-loader',
          },
          {
            text: 'Primitive loader requirements',
            link: '/guide/testing/architecture/primitive-loader-requirements',
          },
        ],
      },
      {
        text: 'Extensible architecture graph',
        link: '/guide/testing/extensible-architecture-graph',
      },
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
    text: 'Internationalisation',
    collapsed: true,
    items: [
      { text: 'Type-safe i18n', link: '/guide/i18n/' },
      { text: 'The catalogue', link: '/guide/i18n/catalog' },
      { text: 'Tokens', link: '/guide/i18n/tokens' },
      { text: 'The runtime', link: '/guide/i18n/runtime' },
      { text: 'With Effect', link: '/guide/i18n/effect' },
    ],
  },
  {
    text: 'Deployment (experimental)',
    collapsed: true,
    items: [
      { text: 'Overview', link: '/guide/deployment/' },
      { text: 'Manifest reference', link: '/guide/deployment/manifest' },
      { text: 'Diagnostics', link: '/guide/deployment/diagnostics' },
      { text: 'Providers', link: '/guide/deployment/providers' },
      { text: 'Alchemy provider', link: '/guide/deployment/alchemy' },
    ],
  },
  {
    text: 'Going further',
    collapsed: true,
    items: [
      { text: 'SSR and hydration', link: '/guide/advanced/ssr-hydration' },
      { text: 'Effect integration', link: '/guide/advanced/effect' },
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
      {
        text: 'Renames: _tag and providedIn',
        link: '/guide/migration/wave-1-tag-and-provided-in',
      },
      {
        text: 'Effect compatibility & maturity',
        link: '/resources/effect-compatibility',
      },
      {
        text: 'Adopting CraftTS progressively',
        link: '/resources/effect-adoption',
      },
      { text: 'Press kit', link: '/resources/press-kit' },
      { text: 'Roadmap', link: '/resources/roadmap' },
      { text: 'Backlog', link: '/resources/backlog' },
    ],
  },
];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: '@craft-ts',
  base: '/craft/',
  description: 'Type-safe Craft applications, by construction',
  // Repository files, not pages. Without this they are published, unreachable
  // from the sidebar and the nav — the state every `.md` under apps/docs is
  // meant to be out of. Every other page has a sidebar entry; see the
  // architecture rule in the plan of 2026-08-25.
  srcExclude: ['README.md', 'public/assets/README.md'],
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
      {
        text: 'Learn with Effect',
        link: '/learn-effect/',
        activeMatch: '^/learn-effect/',
      },
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
            text: '@craft-ts/effect',
            link: 'https://www.npmjs.com/package/@craft-ts/effect',
          },
          {
            text: '@craft-ts/style',
            link: 'https://www.npmjs.com/package/@craft-ts/style',
          },
          {
            text: '@craft-ts/style-testing',
            link: 'https://www.npmjs.com/package/@craft-ts/style-testing',
          },
          {
            text: '@craft-ts/i18n',
            link: 'https://www.npmjs.com/package/@craft-ts/i18n',
          },
          {
            text: '@craft-ts/i18n-effect',
            link: 'https://www.npmjs.com/package/@craft-ts/i18n-effect',
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
          {
            text: 'Effect compatibility & maturity',
            link: '/resources/effect-compatibility',
          },
          {
            text: 'Adopting CraftTS progressively',
            link: '/resources/effect-adoption',
          },
          { text: 'Press kit', link: '/resources/press-kit' },
          { text: 'Roadmap', link: '/resources/roadmap' },
          { text: 'Backlog', link: '/resources/backlog' },
        ],
      },
    ],

    sidebar: {
      '/learn/': learnSidebar,
      '/learn-effect/': learnEffectSidebar,
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
          'Type-safe Craft applications. Declare. Yield. Derive. Compile — no surprises. Coding agents should start here, then follow linked markdown pages or use the @craft-ts/mcp server. The architecture/ suite is the graph contract — scaffold at bootstrap, run during a feature, encode a smell so it cannot recur.',
        details:
          'After importing @craft-ts/core, run `npx -y @craft-ts/mcp@beta` and read /resources/ai-agents. In local development, the open development tab is driven by the function-registry MCP tool `page` — see /guide/ai/dev-page. yield* every Craft reader. Scaffold architecture/ at bootstrap and run it during a feature; do not add an architecture rule for the feature. Keep authored application code within the Craft primitives and service model.',
        domain: 'https://craft-ts.github.io',
        ignoreFiles: ['public/**', 'README.md'],
      }),
    ],
  },
});
