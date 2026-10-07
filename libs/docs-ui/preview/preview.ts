import {
  button,
  content,
  craftComponent,
  div,
  h,
  p,
  section,
  span,
} from '@craft-ts/component';
import {
  DocBadge,
  DocButton,
  DocCallout,
  DocField,
  DocForest,
  DocHome,
  DocIcon,
  DocIconButton,
  DocKbd,
  DocLayout,
  DocMenu,
  DocNavLink,
  DocNotFound,
  DocPage,
  DocSwitch,
  DocTabs,
  DocToastQueue,
  DocToastRegion,
  DocTooltip,
  ICON_NAMES,
  defaultLabels,
  provideDocModeView,
  provideDocToastQueue,
  type ButtonVariant,
  type SiteConfig,
} from '../src/index.ts';
import { sampleBlocks } from './sample.ts';

const read =
  <T>(value: T) =>
  function* () {
    return value;
  };

const site: SiteConfig = {
  title: 'craft-ts',
  base: '/',
  nav: [
    { text: 'Guide', link: '/guide/state/local-state', activeMatch: '^/guide/' },
    { text: 'Reference', link: '/reference/' },
    { text: 'Learn', link: '/learn/' },
    { text: 'Examples', link: '/resources/examples' },
    {
      text: 'Packages',
      items: [
        { text: '@craft-ts/core', link: 'https://www.npmjs.com/package/@craft-ts/core' },
        { text: '@craft-ts/style', link: 'https://www.npmjs.com/package/@craft-ts/style' },
      ],
    },
  ],
  sidebar: {
    '/guide/': [
      { text: 'Introduction', link: '/guide/' },
      { text: 'Installation', link: '/guide/create-project' },
      {
        text: 'Primitives',
        collapsed: false,
        items: [
          { text: 'state', link: '/guide/state/local-state' },
          { text: 'query', link: '/guide/state/server-state' },
          { text: 'mutation', link: '/guide/state/mutations' },
          { text: 'asyncProcess', link: '/guide/state/async-process' },
          { text: 'queryParams', link: '/guide/state/url-state' },
        ],
      },
      {
        text: 'Composition',
        collapsed: false,
        items: [
          { text: 'Insertions', link: '/guide/concepts/insertions' },
          { text: 'craftService', link: '/guide/app/craft-service' },
          { text: 'Routing', link: '/guide/routing/setup' },
        ],
      },
      {
        text: 'Testing',
        collapsed: true,
        items: [{ text: 'Services', link: '/guide/testing/services' }],
      },
    ],
  },
};

const searchIndex = [
  { href: '/guide/state/local-state', title: 'Local state', headings: ['The common case', 'Equality'], text: 'A state is a signal whose type is the only contract.' },
  { href: '/guide/state/server-state', title: 'query', headings: ['Loading data'], text: 'A query loads server data.' },
  { href: '/guide/state/mutations', title: 'Mutations', headings: ['Optimistic updates'], text: 'A mutation writes server data.' },
];

const frame = (path: string, body: () => unknown, scope: '' | 'dark' = '') =>
  DocLayout({
    site: read(site),
    path: read(path),
    outline: read([
      { level: 2, id: 'the-common-case', text: 'The common case' },
      { level: 2, id: 'equality', text: 'Equality' },
    ]),
    currentHeading: read('the-common-case'),
    scope: read(scope),
    searchIndex: read(searchIndex),
    footerNote: read('craft-ts · MIT licensed'),
    footerLinks: read([
      { text: 'GitHub', href: 'https://github.com/craft-ts/craft-ts' },
      { text: 'npm', href: 'https://www.npmjs.com/org/craft-ts' },
    ]),
    labels: read(defaultLabels),
    badge: read('Beta'),
    body: content(body as never),
  } as never);

const variants: readonly ButtonVariant[] = ['primary', 'tonal', 'secondary', 'danger', 'link'];

const panel = (title: string, children: unknown[]) =>
  section(
    {
      style: () => ({}),
    },
    [h('h2', title), div(children as never)],
  );

const Gallery = craftComponent(
  'Gallery',
  { providers: [provideDocToastQueue(), provideDocModeView()] },
  function* () {
    const queue = yield* DocToastQueue();
    const buttons = variants.map((variant) =>
      DocButton({
        label: read(variant),
        variant: read(variant),
        disabled: read(false),
        loading: read(false),
        press: (() => undefined) as never,
      }),
    );
    const disabled = variants.map((variant) =>
      DocButton({
        label: read(`${variant} off`),
        variant: read(variant),
        disabled: read(true),
        loading: read(false),
        press: (() => undefined) as never,
      }),
    );
    const loading = variants.slice(0, 4).map((variant) =>
      DocButton({
        label: read('Saving'),
        variant: read(variant),
        disabled: read(false),
        loading: read(true),
        press: (() => undefined) as never,
      }),
    );
    return div({ 'data-gallery': '' }, [
      h('h1', 'docs-ui gallery'),
      panel('Buttons', [
        div(buttons),
        div(disabled),
        div(loading),
        div([
          DocIconButton({ label: read('Copy'), icon: read('copy'), disabled: read(false), press: (() => undefined) as never }),
          DocIconButton({ label: read('Search'), icon: read('search'), disabled: read(true), press: (() => undefined) as never }),
        ]),
      ]),
      panel('Badges and keys', [
        ...(['info', 'tip', 'important', 'warning', 'danger'] as const).map((tone) =>
          DocBadge({ tone: read(tone), label: read(tone) }),
        ),
        DocKbd({ keys: read('⌘') }),
        DocKbd({ keys: read('K') }),
      ]),
      panel('Icons', ICON_NAMES.map((name) =>
        span([DocIcon({ name: read(name), size: read('lg') }), ' ', name, '  ']),
      )),
      panel('Navigation', [
        DocNavLink({ label: read('Introduction'), href: read('#'), current: read(false), icon: read('') }),
        DocNavLink({ label: read('state'), href: read('#'), current: read(true), icon: read('sprout') }),
        DocNavLink({ label: read('query'), href: read('#'), current: read(false), icon: read('') }),
      ]),
      panel('Fields', [
        DocField({ label: read('Search the docs'), fieldId: read('f1'), value: read(''), placeholder: read('Type a word'), hint: read('Two letters at least'), invalid: read(false), disabled: read(false), focusOnOpen: read(false), edit: (() => undefined) as never }),
        DocField({ label: read('Invalid'), fieldId: read('f2'), value: read('x'), placeholder: read(''), hint: read('This value was refused'), invalid: read(true), disabled: read(false), focusOnOpen: read(false), edit: (() => undefined) as never }),
        DocField({ label: read('Disabled'), fieldId: read('f3'), value: read(''), placeholder: read('Not now'), hint: read(''), invalid: read(false), disabled: read(true), focusOnOpen: read(false), edit: (() => undefined) as never }),
        DocSwitch({ label: read('Dark mode'), controlId: read('s1'), on: read(true), disabled: read(false), toggle: (() => undefined) as never }),
        DocSwitch({ label: read('Off'), controlId: read('s2'), on: read(false), disabled: read(false), toggle: (() => undefined) as never }),
      ]),
      panel('Tabs', [
        DocTabs({
          group: read('g'),
          surface: read('page'),
          items: read([
            { id: 'a', label: 'One', render: () => p('First panel') },
            { id: 'b', label: 'Two', render: () => p('Second panel') },
          ]),
        }),
      ]),
      panel('Menu and tooltip', [
        DocMenu({
          label: read('Packages'),
          menuId: read('m'),
          items: read([
            { label: '@craft-ts/core', href: '#', hint: '' },
            { label: '@craft-ts/style', href: '#', hint: 'npm' },
          ]),
        }),
        DocTooltip({
          tip: read('Copy code'),
          tipId: read('tip1'),
          body: content(() =>
            button('t', { type: 'button', 'aria-describedby': 'tip1' }, 'Hover or focus me'),
          ),
        }),
      ]),
      panel('Toasts', [
        button('toastTip', { type: 'button', click: () => queue.push('tip', 'Saved to the herbarium.') }, 'Push a tip'),
        button('toastWarn', { type: 'button', click: () => queue.push('warning', 'This signature will change.') }, 'Push a warning'),
        button('toastDanger', { type: 'button', click: () => queue.push('danger', 'The save failed.') }, 'Push a danger'),
      ]),
      panel('Callouts', (['info', 'tip', 'important', 'warning', 'danger'] as const).map((tone) =>
        DocCallout({
          tone: read(tone),
          caption: read(tone.toUpperCase()),
          body: content(() => p('The dependency graph is visible to the compiler.')),
        }),
      )),
      DocForest({}),
      DocToastRegion({}),
    ]);
  },
);

export const Preview = craftComponent('Preview', {}, function* () {
  const page = new URLSearchParams(globalThis.location?.search ?? '').get('page') ?? 'guide';
  switch (page) {
    case 'home':
      return frame('/', () =>
        DocHome({
          hero: read({
            name: '@craft-ts',
            text: 'Safe AI-first APP, by construction.',
            tagline: 'Fine-grained reactivity. Declare. Yield. Derive. Compile — no surprises.',
            plateCaption: 'Fig. 1. One state, branching into everything derived from it.',
            actions: [
              { theme: 'brand', text: 'Start the tutorial', link: '/learn/' },
              { theme: 'alt', text: 'Guide', link: '/guide/' },
              { theme: 'alt', text: 'Examples', link: '/resources/examples' },
            ],
          }),
          features: read([
            { title: 'Fine-grained reactivity', details: 'A signal read inside a binding invalidates only that text, property, class or style.', link: '/guide/components/fine-grained-reactivity' },
            { title: 'One API for every kind of state', details: 'state, query, mutation, queryParams and asyncProcess share the same shape.', link: '' },
            { title: 'Exceptions as values', details: 'A declared failure is returned, not thrown — it travels through types instead of the stack.', link: '/guide/concepts/exceptions' },
          ]),
          base: read('/'),
        }),
      );
    case '404':
      return frame('/nope', () =>
        DocNotFound({
          eyebrow: read('404'),
          heading: read('Off the trail'),
          message: read('This page is not in the herbarium. It may have moved, or never grown.'),
          homeLabel: read('Back to the start'),
          homeHref: read('/'),
        }),
      );
    case 'effect':
      return frame('/guide/state/local-state', () =>
        DocPage({ blocks: read(sampleBlocks), components: read({}) }),
      'dark');
    case 'gallery':
      return Gallery({});
    default:
      return frame('/guide/state/local-state', () =>
        DocPage({ blocks: read(sampleBlocks), components: read({}) }),
      );
  }
});
