import { signal } from '@angular/core';
import { abstract, craftException, craftService } from '@craft-ng/core';
import {
  button,
  catchTag,
  craftComponent,
  h2,
  p,
  section,
  withProviders,
} from '@craft-ng/component';

const noAccess = craftException({ code: 'NO_ACCESS' });
const { RestrictedData, provideRestrictedData } = craftService(
  { name: 'restrictedData', scope: 'abstract' },
  abstract<string | typeof noAccess>(),
);

const canReadRestrictedData = signal(false);
const lastHandledException = signal('');

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
  () => ({}),
  () =>
    section({ class: 'component-demo component-demo__composition-page' }, [
      h2('Composition réactive avec providers'),
      p(
        'Le provider fournit les données au composant. Cliquez pour passer par le handler NO_ACCESS, puis revenir au template.',
      ),
      button(
        {
          class: 'component-demo__access-toggle',
          click: () => canReadRestrictedData.update((value) => !value),
        },
        'Changer les droits',
      ),
      p(() => lastHandledException()),
      restrictedContent.pipe(
        withProviders([
          provideRestrictedData(() =>
            canReadRestrictedData() ? 'accessible' : noAccess,
          ),
        ]),
        catchTag.exhaustive({
          NO_ACCESS: function* () {
            lastHandledException.set(
              'NO_ACCESS géré par catchTag (la boundary ne rend pas de template).',
            );
          },
        }),
      )({}),
    ]),
);
