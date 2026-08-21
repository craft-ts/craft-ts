import {
  article,
  craftComponent,
  div,
  h2,
  p,
  section,
  span,
} from '@craft-ts/component';
import { pendingBlock } from '@craft-ts/component';
import {
  BrowserWindow,
  LocalStorage,
  craftComputed,
  query,
  settled,
} from '@craft-ts/core';
import { page } from './page-layout';

export const ClientOnlyPage = craftComponent(
  'SsrClientOnlyPage',
  {},
  function* () {
    const data = yield* query('clientOnlyData', {
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
    });
    const resolved = craftComputed('resolvedClientOnlyData', function* () {
      return yield* settled(data);
    });
    return { resolved };
  },
  ({ resolved }) =>
    page(
      'Route SSR : `client`',
      'Contenu réservé au navigateur',
      'La source ne démarre pas pendant renderCraft. Le navigateur la lance après hydrateCraft, ce qui permet d’utiliser viewport et localStorage sans bloquer le SSR.',
      section({ class: 'grid' }, [
        article({ class: 'card card--accent' }, [
          span({ class: 'badge badge--client' }, 'client-only'),
          h2('Donnée navigateur'),
          div({ class: 'pending-box' }, function* () {
            const value = yield* resolved();
            return `${value.width}px · ${value.visits} visite(s)`;
          }),
        ]),
        article({ class: 'card' }, [
          h2('Le placeholder est rendu côté serveur'),
          p(
            'Le navigateur remplit ensuite cette zone avec ses propres capacités. Rafraîchis pour voir le compteur localStorage évoluer.',
          ),
        ]),
      ]).pipe(
        pendingBlock({
          ssr: 'client',
          fallback: () =>
            div({ class: 'pending-box' }, [
              span('En attente de l’hydratation…'),
              div({ class: 'skeleton' }),
            ]),
        }),
      ),
    ),
);
