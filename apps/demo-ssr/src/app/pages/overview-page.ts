import {
  a,
  article,
  craftComponent,
  h2,
  li,
  p,
  section,
  ul,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { page } from './page-layout';
import { Pipeline } from './pipeline';

export const OverviewPage = craftComponent(
  'SsrOverviewPage',
  {},
  () => ({}),
  () =>
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
            { class: 'button', craftRouterLink: { to: 'data' } },
            'Voir la query bloquante',
          ).pipe(CraftRouterLink),
        ]),
      ]),
    ),
);
