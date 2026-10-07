import {
  button,
  craftComponent,
  div,
  forNode,
  input,
  label,
  li,
  span,
  textarea,
  ul,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { migrateTemplateToCraft } from '@craft-ts/dev-tools/template-migration';
import { migratorUi } from './template-migrator.style.ts';

const INITIAL_SOURCE = `<section class="card">
  <h2>Hello</h2>
  <button class="primary" type="button">Save</button>
</section>`;

interface Form {
  readonly source: string;
  readonly name: string;
  readonly copied: boolean;
}

const migrate = (form: Form) =>
  migrateTemplateToCraft(form.source, {
    componentName: form.name || undefined,
  });

/** What the person typed, and whether "Copy" was just pressed. */
const { MigratorView, provideMigratorView } = craftService(
  { name: 'migratorView', providedIn: 'toProvide' },
  function* () {
    const form = yield* state(
      'form',
      { source: INITIAL_SOURCE, name: '', copied: false } as Form,
      ({ update }) => ({
        setSource: (source: string) => update((value) => ({ ...value, source })),
        setName: (name: string) => update((value) => ({ ...value, name })),
        flash: () => {
          update((value) => ({ ...value, copied: true }));
          setTimeout(() => update((value) => ({ ...value, copied: false })), 1500);
        },
      }),
    );
    yield* craftExpose('setSource', form.setSource);
    yield* craftExpose('setName', form.setName);
    yield* craftExpose('flash', form.flash);
  },
);

/**
 * The template migrator of the guide: paste HTML, read the Craft template. The
 * conversion is the dev-tools function, run on every keystroke in the browser.
 */
export const TemplateMigrator = craftComponent(
  'TemplateMigrator',
  { providers: [provideMigratorView()] },
  function* () {
    const view = yield* MigratorView();
    const result = function* () {
      return migrate(yield* view.form());
    };
    return div({ class: migratorUi.root }, [
      label({ class: migratorUi.label, htmlFor: 'craft-template-source' }, 'HTML or Web component to convert'),
      textarea('migratorSource', {
        id: 'craft-template-source',
        'aria-label': 'HTML or Web component to convert',
        class: migratorUi.area,
        rows: 10,
        spellcheck: false,
        value: function* () {
          return (yield* view.form()).source;
        },
        input: (event) => view.setSource(event.target.value),
      }),
      label({ class: migratorUi.label, htmlFor: 'craft-template-name' }, 'Full component name (optional)'),
      input('migratorName', {
        id: 'craft-template-name',
        class: migratorUi.field,
        type: 'text',
        placeholder: 'e.g. SaveCard',
        value: function* () {
          return (yield* view.form()).name;
        },
        input: (event) => view.setName(event.target.value),
      }),
      div({ class: migratorUi.toolbar }, [
        span({ class: migratorUi.warning, 'aria-live': 'polite' }, function* () {
          const count = (yield* result()).diagnostics.length;
          return count ? `${count} point(s) to check manually` : '';
        }),
        button(
          'migratorCopy',
          {
            type: 'button',
            class: migratorUi.copy,
            *click() {
              const code = (yield* result()).code;
              const clipboard =
                typeof navigator === 'undefined' ? undefined : navigator.clipboard;
              if (!clipboard) return;
              void clipboard.writeText(code).then(() => view.flash(), () => undefined);
            },
          },
          function* () {
            return (yield* view.form()).copied ? 'Copied' : 'Copy the template';
          },
        ),
      ]),
      textarea('migratorOutput', {
        class: migratorUi.area,
        rows: 16,
        readonly: true,
        spellcheck: false,
        'aria-label': 'Generated Craft template',
        value: function* () {
          return (yield* result()).code;
        },
      }),
      ul(
        { class: migratorUi.diagnostics },
        forNode(
          function* () {
            return (yield* result()).diagnostics;
          },
          { track: (diagnostic) => diagnostic.message },
          (diagnostic) =>
            li(function* () {
              return (yield* diagnostic()).message;
            }),
        ),
      ),
    ]);
  },
);
