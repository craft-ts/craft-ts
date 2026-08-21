import {
  a,
  craftComponent,
  p,
  section,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { page } from './page-layout';

export const NotFoundPage = craftComponent(
  'SsrNotFoundPage',
  {},
  () => ({}),
  () =>
    page(
      'Rendu serveur · 404',
      'Page non trouvée',
      'Le serveur et le routeur CraftTS partagent la même route wildcard.',
      section({ class: 'card not-found' }, [
        p('Cette URL ne correspond à aucun scénario SSR.'),
        a(
          'notFoundHomeLink',
          { class: 'button', craftRouterLink: { to: '' } },
          'Revenir à l’accueil',
        ).pipe(CraftRouterLink),
      ]),
    ),
);
