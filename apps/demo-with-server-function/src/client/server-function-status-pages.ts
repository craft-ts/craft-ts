import {
  a,
  craftComponent,
  heading,
  main,
  p,
  section,
} from '@craft-ts/component';
import { statusPage as statusStyle } from './demo.style';

function statusPage(
  name: string,
  eyebrow: string,
  title: string,
  message: string,
  detail: string,
) {
  return craftComponent(
    name,
    {},
    function* () {
      return {};
    },
    () =>
      main({ class: statusStyle.root }, [
        section({ class: statusStyle.card }, [
          p({ class: statusStyle.eyebrow }, eyebrow),
          heading({ class: statusStyle.title }, title),
          p({ class: statusStyle.message }, message),
          p({ class: statusStyle.detail }, detail),
          divActions(),
        ]),
      ]),
  );
}

function divActions() {
  return section({ class: statusStyle.actions }, [
    a(
      'statusHomeLink',
      { class: statusStyle.link, href: '/', 'data-navigation': 'external' },
      'Retour aux produits',
    ),
    a(
      'statusListLink',
      {
        class: statusStyle.link,
        'data-statusLink': 'secondary',
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
