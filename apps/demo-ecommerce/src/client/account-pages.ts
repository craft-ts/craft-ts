import { a, article, button, craftComponent, div, form, heading, headingSection, ifNode, input, label, main, p, span, strong } from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { failureOf } from './shop-format';
import { Session } from './shop-state';
import { demoAccounts } from '../shared/accounts';

const roleLabel = { admin: 'Gérant · accès admin', 'product-manager': 'Product manager · catalogue', client: 'Client · boutique seule' } as const;

/**
 * Connexion avec les comptes de démonstration affichés en clair : un clic sur
 * une carte suffit, le formulaire reste là pour qui veut taper les identifiants.
 */
export const LoginPanel = craftComponent('EcommerceLoginPanel', {}, function* () {
  const session = yield* Session();
  return div({ class: 'login' }, [
    ifNode('session-notice', function* () { return (yield* session.sessionNotice()) !== undefined; }, () => p({ class: 'notice warn' }, function* () { return (yield* session.sessionNotice()) ?? ''; })),
    div({ class: 'account-cards' }, demoAccounts.map((account) => article({ class: 'account-card', 'data-role': account.role }, [
      div({ class: 'account-card-head' }, [
        span({ class: 'avatar', 'data-size': 'large', 'aria-hidden': 'true' }, account.name.slice(0, 1)),
        div([strong(account.name), span({ class: 'role-tag', 'data-role': account.role }, roleLabel[account.role])]),
      ]),
      p({ class: 'muted' }, account.description),
      div({ class: 'credentials' }, [
        span({ class: 'credential-label' }, 'E-mail'), span({ class: 'mono' }, account.email),
        span({ class: 'credential-label' }, 'Mot de passe'), span({ class: 'mono' }, account.password),
      ]),
      button('quick-sign-in', { type: 'button', class: 'button button-block', 'data-variant': account.role === 'admin' ? undefined : 'soft', disabled: session.signInProcess.isLoading, *click() {
        yield* session.signInProcess.mutate({ email: account.email, password: account.password });
      } }, `Se connecter en tant que ${account.name}`),
    ]))),
    form('sign-in-form', { class: 'login-form', *submit(event) {
      event.preventDefault();
      const data = new FormData(event.target as HTMLFormElement);
      yield* session.signInProcess.mutate({ email: String(data.get('email') ?? ''), password: String(data.get('password') ?? '') });
    } }, [
      strong('Ou avec vos identifiants'),
      label({ class: 'field' }, ['E-mail', input('sign-in-email', { name: 'email', type: 'email', autocomplete: 'username', required: true, placeholder: 'camille@atelier.demo' })]),
      label({ class: 'field' }, ['Mot de passe', input('sign-in-password', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })]),
      button('sign-in-submit', { type: 'submit', class: 'button', disabled: session.signInProcess.isLoading }, function* () { return (yield* session.signInProcess.isLoading()) ? 'Connexion…' : 'Se connecter'; }),
      // Un échec renvoyé par le serveur arrive dans le canal d'exception de la query, pas dans sa valeur.
      ifNode('sign-in-failed', function* () { return failureOf(yield* session.signInProcess.value()) !== undefined; }, () => p({ class: 'notice error' }, function* () { return failureOf(yield* session.signInProcess.value())?.message ?? ''; })),
    ]),
  ]);
});

export const LoginPage = craftComponent('EcommerceLoginPage', {}, function* () {
  const session = yield* Session();
  return main([
    ifNode('signed-in', function* () { return (yield* session.currentSession()) !== undefined; },
      () => div({ class: 'empty-state' }, [
        span({ class: 'avatar', 'data-size': 'hero', 'aria-hidden': 'true' }, function* () { return (yield* session.currentSession())?.user.name.slice(0, 1) ?? ''; }),
        heading({ class: 'page-title' }, function* () { return `Bonjour ${(yield* session.currentSession())?.user.name ?? ''} !`; }),
        p({ class: 'lead' }, function* () { const user = (yield* session.currentSession())?.user; return user ? `Session ouverte avec ${user.email} · ${roleLabel[user.role]}.` : ''; }),
        div({ class: 'hero-actions center' }, [
          ifNode('can-admin', function* () { return yield* session.isStaff(); }, () => a('go-admin', { class: 'button' }, 'Ouvrir l’administration →').pipe(CraftRouterLink({ to: 'admin' }))),
          a('go-shop', { class: 'button button-soft' }, 'Aller à la boutique').pipe(CraftRouterLink({ to: 'catalogue' })),
          button('sign-out', { type: 'button', class: 'text-link', *click() {
            const current = yield* session.currentSession();
            if (current) yield* session.signOutProcess.call(current.token);
          } }, 'Se déconnecter'),
        ]),
      ]),
      () => div([
        span({ class: 'eyebrow' }, 'Espace équipe'), heading({ class: 'page-title' }, 'Connexion'),
        p({ class: 'subtitle' }, 'Trois comptes de démonstration sont prêts, un par rôle. Les droits sont contrôlés côté serveur, à chaque action.'),
        headingSection(LoginPanel()),
      ])),
  ]);
});
