import {
  abstract,
  craftException,
  craftService,
  craftComputed,
  state,
} from '@craft-ts/core';
import {
  button,
  catchTag,
  craftComponent,
  p,
  section,
  withProviders,
  heading,
} from '@craft-ts/component';

const noAccess = craftException({ _tag: 'NO_ACCESS' });
const { RestrictedData, provideRestrictedData } = craftService(
  { name: 'restrictedData', scope: 'abstract' },
  abstract<string | typeof noAccess>(),
);

const restrictedContent = craftComponent(
  'restrictedContent',
  {},
  function* () {
    return { value: yield* RestrictedData() };
  },
  ({ value }) =>
    p(
      { class: 'component-demo__restricted-content' },
      `Donnée privée : ${value}`,
    ),
);

export const componentCompositionDemo = craftComponent(
  'componentCompositionDemo',
  { host: { class: 'component-demo-host' } },
  function* () {
    const canReadRestrictedData = yield* state(
      'canReadRestrictedData',
      false,
      ({ update, state }) => ({
        restriction: craftComputed('restriction', function* () {
          return (yield* state()) ? 'accessible' : noAccess;
        }),
        toggle: () => update((v) => !v),
      }),
    );

    const lastHandledException = yield* state(
      'lastHandledException',
      '',
      ({ set }) => ({
        showNoAccessText: () =>
          set(
            'NO_ACCESS géré par catchTag (la boundary ne rend pas de template).',
          ),
      }),
    );
    return {
      canReadRestrictedData,
      lastHandledException,
    };
  },
  ({ canReadRestrictedData, lastHandledException }) =>
    section({ class: 'component-demo component-demo__composition-page' }, [
      heading('Composition réactive avec providers'),
      p(
        'Le provider fournit les données au composant. Cliquez pour passer par le handler NO_ACCESS, puis revenir au template.',
      ),
      button('accessToggle',
        { type: 'button',
          class: 'component-demo__access-toggle',
          click: canReadRestrictedData.toggle,
        },
        'Changer les droits',
      ),
      p(lastHandledException),
      restrictedContent.pipe(
        withProviders([
          provideRestrictedData(function* () {
            return yield* canReadRestrictedData.restriction();
          }),
        ]),
        catchTag.exhaustive({
          NO_ACCESS: function* () {
            yield* lastHandledException.showNoAccessText();
          },
        }),
      )({}),
    ]),
);
