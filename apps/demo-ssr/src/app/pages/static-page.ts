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
import { craftService, state } from '@craft-ts/core';
import { page } from './page-layout';
import { page as pageStyle } from '../ssr-lab.style';

export const { SsrStaticPageView, provideSsrStaticPageView } = craftService(
  { name: 'ssrStaticPageView', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
  },
);

export const StaticPage = craftComponent(
  'SsrStaticPage',
  { providers: [provideSsrStaticPageView()] },
  function* () {
    const { counter } = yield* SsrStaticPageView();
    return page(
      'Mode `block` sans donnée asynchrone',
      'HTML statique rendu par le serveur',
      'Le contenu principal existe entièrement dans la réponse initiale. Le bouton ci-dessous prouve que l’hydratation a ensuite attaché le comportement.',
      section({ class: pageStyle.grid }, [
        article({ class: pageStyle.card, 'data-ssrCard': 'accent' }, [
          span({ class: pageStyle.badge }, 'SSR'),
          h2({ class: pageStyle.cardTitle }, 'Le contenu est déjà là'),
          p(
            { class: pageStyle.text },
            'Ce titre, ce texte et le compteur ont été produits dans le HTML serveur.',
          ),
          div(
            { class: pageStyle.quote },
            'La première peinture ne dépend pas du JavaScript.',
          ),
          button(
            'staticCounterButton',
            {
              class: pageStyle.button,
              type: 'button',
              click: counter.increment,
            },
            ['Tester l’hydratation · ', span(counter)],
          ),
        ]),
        article({ class: pageStyle.card }, [
          h2({ class: pageStyle.cardTitle }, 'À observer'),
          ul({ class: pageStyle.list }, [
            li('Afficher la source de la page.'),
            li('Repérer le texte déjà livré par le serveur.'),
            li('Cliquer après hydratation : le compteur devient interactif.'),
          ]),
        ]),
      ]),
    );
  },
);
