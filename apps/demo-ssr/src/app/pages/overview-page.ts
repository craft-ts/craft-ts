import {
  a,
  article,
  craftComponent,
  h2,
  li,
  p,
  section,
  span,
  ul,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { craftComputed, query, settled } from '@craft-ts/core';
import { page } from './page-layout';
import { Pipeline } from './pipeline';
import { getPublicProducts } from '../../../../demo-with-server-function/src/products/public-products.fn-client';

export const OverviewPage = craftComponent(
  'SsrOverviewPage',
  {},
  function* () {
    const products = yield* query('serverFunctionProducts', {
      params: () => true,
      loader: function* () {
        return yield* getPublicProducts({});
      },
    });
    const resolvedProducts = craftComputed(
      'resolvedServerFunctionProducts',
      function* () {
        return yield* settled(products);
      },
    );
    return { resolvedProducts };
  },
  ({ resolvedProducts }) =>
    page(
      'Rendu côté serveur · démonstration',
      'Comprendre SSR par l’expérience',
      'Chaque page expose une décision différente : attendre la donnée, afficher un fallback, ou laisser le navigateur la charger après hydratation.',
      section({ class: 'grid' }, [
        article({ class: 'card' }, [
          h2('Le pipeline'),
          p(
            'Le serveur produit le premier HTML. Le navigateur reprend ensuite le même arbre CraftTS.',
          ),
          Pipeline(),
          p(
            { class: 'muted' },
            'Désactive JavaScript après un rechargement pour observer le HTML initial.',
          ),
        ]),
        article({ class: 'card card--accent' }, [
          h2('Ce que l’on compare'),
          ul([
            li("ssr: { mode: 'block' } : la route attend une query."),
            li(
              "ssr: { mode: 'fallback' } : le shell part avec un pending block.",
            ),
            li(
              "ssr: { mode: 'client' } : la source ne démarre qu’au navigateur.",
            ),
          ]),
          a(
            'overviewDataLink',
            { class: 'button' },
            'Voir la query bloquante',
          ).pipe(CraftRouterLink({ to: 'data' })),
        ]),
        article({ class: 'card' }, [
          span({ class: 'badge' }, 'server function'),
          h2('Même façade, deux transports'),
          p(
            'Cette liste appelle la façade produit partagée avec la démo server functions. En SSR, application.invoke est utilisé directement ; après hydratation, le snapshot évite un second appel.',
          ),
          ul([
            function* () {
              return `Produits rendus : ${(yield* resolvedProducts()).length}`;
            },
            function* () {
              const first = (yield* resolvedProducts())[0];
              return `Premier produit : ${first?.name ?? 'aucun'}`;
            },
          ]),
        ]),
      ]),
    ),
);
