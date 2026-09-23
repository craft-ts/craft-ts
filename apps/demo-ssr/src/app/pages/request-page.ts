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
import { page as pageStyle } from '../ssr-lab.style';

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
      section({ class: pageStyle.grid }, [
        article({ class: pageStyle.card, 'data-ssrCard': 'accent' }, [
          span({ class: pageStyle.badge }, 'SSR'),
          h2({ class: pageStyle.cardTitle }, `Bonjour ${name} !`),
          p(
            { class: pageStyle.text },
            'Cette salutation a été résolue pendant le rendu de la route.',
          ),
          form({ class: pageStyle.form, method: 'get', action: '/request' }, [
            label({ for: 'name', class: pageStyle.label }, 'Changer le nom'),
            input('requestNameInput', {
              class: pageStyle.input,
              id: 'name',
              name: 'name',
              value: name,
            }),
            button(
              'requestSubmitButton',
              { class: pageStyle.button, type: 'submit' },
              'Rendre à nouveau',
            ),
          ]),
        ]),
        article({ class: pageStyle.card }, [
          h2({ class: pageStyle.cardTitle }, 'Frontière SSR / SPA'),
          p(
            { class: pageStyle.text },
            'Un rechargement direct repasse par renderCraft. Le formulaire et les liens internes sont ensuite interceptés par le routeur CraftTS.',
          ),
        ]),
      ]),
    ),
);
