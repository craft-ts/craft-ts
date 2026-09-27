import {
  article,
  craftComponent,
  div,
  h2,
  p,
  section,
  span,
} from '@craft-ts/component';
import { pendingNode } from '@craft-ts/component';
import {
  craftService,
  BrowserWindow,
  LocalStorage,
  craftComputed,
  query,
  settled,
  craftPrivate,
} from '@craft-ts/core';
import { page } from './page-layout';
import { page as pageStyle } from '../ssr-lab.style';

export const { SsrClientOnlyPageView, provideSsrClientOnlyPageView } = craftService(
  { name: 'ssrClientOnlyPageView', providedIn: 'toProvide' },
  function* () {
    const data = yield* craftPrivate(query('clientOnlyData', {
      params: () => true,
      loader: function* () {
        const width = yield* BrowserWindow.innerWidth();
        const previous = Number(
          (yield* LocalStorage.getItem('ssr-lab-visits')) || '0',
        );
        const visits = previous + 1;
        yield* LocalStorage.setItem('ssr-lab-visits', String(visits));
        return { width, visits };
      },
    }));
    yield* craftComputed('resolved', function* () {
      return yield* settled(data);
    });
  },
);

export const ClientOnlyPage = craftComponent(
  'SsrClientOnlyPage',
  { providers: [provideSsrClientOnlyPageView()] },
  function* () {
    const { resolved } = yield* SsrClientOnlyPageView();
    return page(
      'Route SSR : `client`',
      'Contenu réservé au navigateur',
      'La source ne démarre pas pendant renderCraft. Le navigateur la lance après hydrateCraft, ce qui permet d’utiliser viewport et localStorage sans bloquer le SSR.',
      section({ class: pageStyle.grid }, [
        article({ class: pageStyle.card, 'data-ssrCard': 'accent' }, [
          span(
            { class: pageStyle.badge, 'data-ssrBadge': 'client' },
            'client-only',
          ),
          h2({ class: pageStyle.cardTitle }, 'Donnée navigateur'),
          div({ class: pageStyle.pendingBox }, function* () {
            const value = yield* resolved();
            return `${value.width}px · ${value.visits} visite(s)`;
          }),
        ]),
        article({ class: pageStyle.card }, [
          h2(
            { class: pageStyle.cardTitle },
            'Le placeholder est rendu côté serveur',
          ),
          p(
            { class: pageStyle.text },
            'Le navigateur remplit ensuite cette zone avec ses propres capacités. Rafraîchis pour voir le compteur localStorage évoluer.',
          ),
        ]),
      ]).pipe(
        pendingNode({
          ssr: 'client',
          fallback: () =>
            div({ class: pageStyle.pendingBox }, [
              span('En attente de l’hydratation…'),
              div({ class: pageStyle.skeleton }),
            ]),
        }),
      ),
    );
  },
);
