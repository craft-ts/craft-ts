import {
  a,
  craftComponent,
  heading,
  main,
  p,
  section,
} from '@craft-ts/component';

const statusPageStyles = `
  :scope { display: block; min-height: 100vh; color: #172033; background: #f6f7fb; }
  main { display: grid; place-items: center; min-height: 70vh; padding: 48px 20px; }
  .card { width: min(620px, 100%); padding: 34px; border: 1px solid #e2e6ef; border-radius: 18px; background: #fff; box-shadow: 0 14px 34px #25345a0d; }
  .eyebrow { margin: 0 0 12px; color: #5570c7; font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  h1 { margin: 0; color: #172033; font-size: clamp(2rem, 5vw, 3.2rem); letter-spacing: -.05em; line-height: 1.02; }
  .message { margin: 16px 0 0; color: #526078; font-size: 1rem; line-height: 1.6; }
  .detail { margin: 10px 0 0; color: #7a8498; font-size: .84rem; line-height: 1.55; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
  a { padding: 10px 14px; border-radius: 9px; color: #fff; background: #4665c4; font-size: .82rem; font-weight: 800; text-decoration: none; }
  a:hover { background: #3855ad; }
  a.secondary { color: #4665c4; background: #edf2ff; }
`;

function statusPage(
  name: string,
  eyebrow: string,
  title: string,
  message: string,
  detail: string,
) {
  return craftComponent(
    name,
    { styles: statusPageStyles },
    function* () {
      return {};
    },
    () =>
      main([
        section({ class: 'card' }, [
          p({ class: 'eyebrow' }, eyebrow),
          heading(title),
          p({ class: 'message' }, message),
          p({ class: 'detail' }, detail),
          divActions(),
        ]),
      ]),
  );
}

function divActions() {
  return section({ class: 'actions' }, [
    a(
      'statusHomeLink',
      { href: '/', 'data-navigation': 'external' },
      'Retour aux produits',
    ),
    a(
      'statusListLink',
      {
        class: 'secondary',
        href: '/authenticated-list',
        'data-navigation': 'external',
      },
      'Réessayer la liste',
    ),
  ]);
}

export const SessionRequiredPage = statusPage(
  'SessionRequiredPage',
  'Authentification requise',
  'Reconnectez-vous pour continuer',
  'Votre session n’est pas disponible pour cette fonctionnalité.',
  'Reconnectez-vous avec un compte administrateur, puis relancez la liste authentifiée.',
);

export const SessionRevokedPage = statusPage(
  'SessionRevokedPage',
  'Session révoquée',
  'Votre session doit être renouvelée',
  'Cette session a été révoquée et ne peut plus être utilisée.',
  'Reconnectez-vous avec un compte administrateur avant de réessayer.',
);

export const AccessDeniedPage = statusPage(
  'AccessDeniedPage',
  'Accès refusé',
  'Vous n’avez pas les droits nécessaires',
  'Cette page est réservée aux utilisateurs administrateurs authentifiés.',
  'Le serveur a refusé l’accès. Changez de compte ou demandez les droits requis.',
);

export const UsersNotFoundPage = statusPage(
  'UsersNotFoundPage',
  'Aucun résultat',
  'Aucun utilisateur trouvé',
  'La recherche ne correspond à aucun utilisateur authentifié.',
  'Modifiez le terme de recherche ou revenez à la liste publique.',
);
