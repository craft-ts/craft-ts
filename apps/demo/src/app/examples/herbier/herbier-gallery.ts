/* eslint-disable craft-ts/no-type-assertions-in-craft-code, craft-ts/no-type-assertions-in-template --
   The design system's Output inputs (`press`, `toggle`, `edit`) take a handler
   branded as an output; a gallery that only shows the states passes a no-op,
   which TypeScript cannot brand without a cast. */
import {
  button,
  content,
  craftComponent,
  div,
  heading,
  p,
  section,
  span,
} from '@craft-ts/component';
import { example } from '../shared/example.style';
import { gallery } from './herbier-gallery.style';
import {
  DocBadge,
  DocButton,
  DocIconButton,
  type ButtonVariant,
  DocCallout,
  DocCode,
  type CodeLine,
  DocField,
  DocIcon,
  ICON_NAMES,
  DocMenu,
  DocTooltip,
  DocSwitch,
  DocTabs,
  DocToastQueue,
  DocToastRegion,
  provideDocToastQueue,
} from '@craft-ts/ui';
import { buttonUi } from '@craft-ts/ui/style';

const read =
  <T>(value: T) =>
  function* () {
    return value;
  };

const noop = (() => undefined) as never;

const VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'tonal',
  'secondary',
  'danger',
  'link',
];

const TONES = ['info', 'tip', 'important', 'warning', 'danger'] as const;

const SNIPPET: readonly CodeLine[] = [
  {
    tokens: [
      { text: 'const ', kind: 'keyword' },
      { text: 'count', kind: 'function' },
      { text: ' = ', kind: 'punctuation' },
      { text: 'yield* ', kind: 'keyword' },
      { text: 'state', kind: 'function' },
      { text: '(', kind: 'punctuation' },
      { text: "'count'", kind: 'string' },
      { text: ', ', kind: 'punctuation' },
      { text: '0', kind: 'number' },
      { text: ');', kind: 'punctuation' },
    ],
  },
  {
    tokens: [{ text: '// one state, everything derived from it', kind: 'comment' }],
  },
];

const group = (title: string, children: unknown[]) =>
  section({ class: gallery.group }, [
    heading({ class: example.subtitle }, title),
    div({ class: gallery.row }, children as never),
  ]);

const stackedGroup = (title: string, children: unknown[]) =>
  section({ class: gallery.group }, [
    heading({ class: example.subtitle }, title),
    div({ class: example.stack }, children as never),
  ]);

/**
 * The Herbier design system, one of each: the components that live in
 * `src/app/herbier`, in the states the examples use them in. The examples
 * themselves read the same `theme` variables, so this page and the rest of the
 * demo change together with the mode and the season in the bar.
 */
export const HerbierGallery = craftComponent(
  'HerbierGallery',
  { providers: [provideDocToastQueue()] },
  function* () {
    const queue = yield* DocToastQueue();
    return div({ class: example.page }, [
      heading({ class: example.title }, 'Herbier design system'),
      p(
        { class: example.text },
        'The components the examples are built with. Switch the season or the mode in the bar and every one of them follows.',
      ),
      group('Buttons', [
        ...VARIANTS.map((variant) =>
          DocButton({
            label: read(variant),
            variant: read(variant),
            disabled: read(false),
            loading: read(false),
            press: noop,
          }),
        ),
        DocButton({
          label: read('Saving'),
          variant: read('primary' as const),
          disabled: read(false),
          loading: read(true),
          press: noop,
        }),
        DocButton({
          label: read('Disabled'),
          variant: read('secondary' as const),
          disabled: read(true),
          loading: read(false),
          press: noop,
        }),
        DocIconButton({
          label: read('Copy'),
          icon: read('copy' as const),
          disabled: read(false),
          press: noop,
        }),
      ]),
      group(
        'Badges',
        TONES.map((tone) => DocBadge({ tone: read(tone), label: read(tone) })),
      ),
      group(
        'Callouts',
        TONES.map((tone) =>
          DocCallout({
            tone: read(tone),
            caption: read(tone.toUpperCase()),
            body: content(() => p('The dependency graph is visible to the compiler.')),
          }),
        ),
      ),
      group('Fields', [
        DocField({
          label: read('Name'),
          fieldId: read('gallery-name'),
          value: read(''),
          placeholder: read('Ada Lovelace'),
          hint: read('As it appears on the card'),
          invalid: read(false),
          disabled: read(false),
          focusOnOpen: read(false),
          edit: noop,
        }),
        DocField({
          label: read('Invalid'),
          fieldId: read('gallery-invalid'),
          value: read('x'),
          placeholder: read(''),
          hint: read('This value was refused'),
          invalid: read(true),
          disabled: read(false),
          focusOnOpen: read(false),
          edit: noop,
        }),
        DocSwitch({
          label: read('Optimistic update'),
          controlId: read('gallery-switch'),
          on: read(true),
          disabled: read(false),
          toggle: noop,
        }),
      ]),
      stackedGroup('Tabs and code', [
        DocTabs({
          group: read('gallery'),
          surface: read('page' as const),
          items: read([
            { id: 'a', label: 'State', render: () => p('A state is a signal.') },
            { id: 'b', label: 'Query', render: () => p('A query loads server data.') },
          ]),
        }),
        DocCode({
          lines: read(SNIPPET),
          filename: read('counter.ts'),
          language: read('ts'),
          numbered: read(true),
          firstLine: read(1),
        }),
      ]),
      group('Menu and tooltip', [
        DocMenu({
          label: read('Packages'),
          menuId: read('gallery-menu'),
          items: read([
            { label: '@craft-ts/core', href: 'https://www.npmjs.com/package/@craft-ts/core', hint: '' },
            { label: '@craft-ts/style', href: 'https://www.npmjs.com/package/@craft-ts/style', hint: 'npm' },
          ]),
        }),
        DocTooltip({
          tip: read('Copy code'),
          tipId: read('gallery-tip'),
          body: content(() =>
            button(
              'galleryTip',
              {
                class: buttonUi.root,
                'data-variant': 'secondary',
                type: 'button',
                'aria-describedby': 'gallery-tip',
              },
              'Hover or focus me',
            ),
          ),
        }),
      ]),
      group('Toasts', [
        button(
          'toastTip',
          { class: buttonUi.root, 'data-variant': 'secondary', type: 'button', click: function* () { yield* queue.push('tip', 'Saved to the herbarium.'); } },
          'Push a tip',
        ),
        button(
          'toastDanger',
          { class: buttonUi.root, 'data-variant': 'secondary', type: 'button', click: function* () { yield* queue.push('danger', 'The save failed.'); } },
          'Push a danger',
        ),
      ]),
      group(
        'Icons',
        ICON_NAMES.map((name) =>
          span({ class: gallery.icon }, [
            DocIcon({ name: read(name), size: read('lg' as const) }),
            span({ class: example.hint }, name),
          ]),
        ),
      ),
      DocToastRegion({}),
    ]);
  },
);
