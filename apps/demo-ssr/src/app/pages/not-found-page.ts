import { a, craftComponent, p, section } from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { page } from './page-layout';
import { page as pageStyle } from '../ssr-lab.style';

export const NotFoundPage = craftComponent(
  'SsrNotFoundPage',
  {},
  () => ({}),
  () =>
    page(
      'Rendu serveur · 404',
      'Page non trouvée',
      'Le serveur et le routeur CraftTS partagent la même route wildcard.',
      section({ class: [pageStyle.card, pageStyle.notFound] }, [
        p(
          { class: pageStyle.text },
          'Cette URL ne correspond à aucun scénario SSR.',
        ),
        a(
          'notFoundHomeLink',
          { class: pageStyle.button },
          'Revenir à l’accueil',
        ).pipe(CraftRouterLink({ to: '' })),
      ]),
    ),
);
