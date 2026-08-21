import {
  article,
  button,
  craftComponent,
  form,
  h2,
  input,
  label,
  p,
  section,
  span,
} from '@craft-ts/component';
import { BrowserLocation } from '@craft-ts/core';
import { page } from './page-layout';

export const RequestPage = craftComponent(
  'SsrRequestPage',
  {},
  function* () {
    const search = yield* BrowserLocation.search();
    const name = new URLSearchParams(search).get('name') || 'visiteur';
    return { name };
  },
  ({ name }) =>
    page(
      'Données de la requête disponibles au SSR',
      'Personnalisation par URL',
      'Le serveur et le navigateur utilisent la même route Craft. La première réponse lit la query string, puis les navigations suivantes restent côté client.',
      section({ class: 'grid' }, [
        article({ class: 'card card--accent' }, [
          span({ class: 'badge' }, 'SSR'),
          h2(`Bonjour ${name} !`),
          p('Cette salutation a été résolue pendant le rendu de la route.'),
          form({ class: 'inline-form', method: 'get', action: '/request' }, [
            label({ for: 'name' }, 'Changer le nom'),
            input('requestNameInput', {
              id: 'name',
              name: 'name',
              value: name,
            }),
            button(
              'requestSubmitButton',
              { class: 'button', type: 'submit' },
              'Rendre à nouveau',
            ),
          ]),
        ]),
        article({ class: 'card' }, [
          h2('Frontière SSR / SPA'),
          p(
            'Un rechargement direct repasse par renderCraft. Le formulaire et les liens internes sont ensuite interceptés par le routeur CraftTS.',
          ),
        ]),
      ]),
    ),
);
