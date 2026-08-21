import {
  article,
  button,
  craftComponent,
  div,
  h2,
  li,
  p,
  section,
  span,
  ul,
} from '@craft-ts/component';
import { state } from '@craft-ts/core';
import { page } from './page-layout';

export const StaticPage = craftComponent(
  'SsrStaticPage',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    return { counter };
  },
  ({ counter }) =>
    page(
      'Mode `block` sans donnée asynchrone',
      'HTML statique rendu par le serveur',
      'Le contenu principal existe entièrement dans la réponse initiale. Le bouton ci-dessous prouve que l’hydratation a ensuite attaché le comportement.',
      section({ class: 'grid' }, [
        article({ class: 'card card--accent' }, [
          span({ class: 'badge' }, 'SSR'),
          h2('Le contenu est déjà là'),
          p(
            'Ce titre, ce texte et le compteur ont été produits dans le HTML serveur.',
          ),
          div(
            { class: 'quote' },
            'La première peinture ne dépend pas du JavaScript.',
          ),
          button(
            'staticCounterButton',
            { class: 'button', type: 'button', click: counter.increment },
            ['Tester l’hydratation · ', span(counter)],
          ),
        ]),
        article({ class: 'card' }, [
          h2('À observer'),
          ul([
            li('Afficher la source de la page.'),
            li('Repérer le texte déjà livré par le serveur.'),
            li('Cliquer après hydratation : le compteur devient interactif.'),
          ]),
        ]),
      ]),
    ),
);
