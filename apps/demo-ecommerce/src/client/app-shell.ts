import { a, craftComponent, CraftRouterOutlet, div, footer, header, ifNode, main, nav, span } from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { Cart, Session } from './shop-state';

export const AppShell = craftComponent('EcommerceAppShell', {}, function* () {
  const cart = yield* Cart();
  const session = yield* Session();
  return div({ class: 'app-shell' }, [
    div({ class: 'announce' }, 'Retrait en boutique offert · Préparé le matin même · Paiement de démonstration'),
    header({ class: 'topbar' }, [
      a('brand', { class: 'brand' }, 'atelier.').pipe(CraftRouterLink({ to: '' })),
      nav({ class: 'main-nav' }, [
        a('home', {}, 'Accueil').pipe(CraftRouterLink({ to: '' })),
        a('shop', {}, 'La boutique').pipe(CraftRouterLink({ to: 'catalogue' })),
        a('admin', {}, 'Administration').pipe(CraftRouterLink({ to: 'admin' })),
      ]),
      div({ class: 'top-actions' }, [
        ifNode('signed-in', function* () { return (yield* session.currentSession()) !== undefined; },
          () => a('account', { class: 'account-chip', 'aria-label': 'Mon compte' }, [
            span({ class: 'avatar', 'aria-hidden': 'true' }, function* () { return (yield* session.currentSession())?.user.name.slice(0, 1) ?? ''; }),
            span({ class: 'account-name' }, function* () { return (yield* session.currentSession())?.user.name ?? ''; }),
            span({ class: 'role-tag', 'data-role': function* () { return (yield* session.currentSession())?.user.role; } }, function* () { const role = (yield* session.currentSession())?.user.role; return role === 'admin' ? 'Admin' : role === 'product-manager' ? 'Produit' : 'Client'; }),
          ]).pipe(CraftRouterLink({ to: 'connexion' })),
          () => a('sign-in', { class: 'ghost-link' }, 'Se connecter').pipe(CraftRouterLink({ to: 'connexion' }))),
        a('cart', { class: 'cart-button', 'aria-label': function* () { return `Panier, ${yield* cart.cartCount()} article(s)`; } }, [
          span({ class: 'cart-icon', 'aria-hidden': 'true' }, '🛍'),
          span({ class: 'cart-label' }, 'Panier'),
          span({ class: 'cart-count', 'data-empty': function* () { return (yield* cart.cartCount()) === 0 ? 'true' : undefined; } }, function* () { return String(yield* cart.cartCount()); }),
        ]).pipe(CraftRouterLink({ to: 'panier' })),
      ]),
    ]),
    main({ class: 'page' }, CraftRouterOutlet()),
    footer({ class: 'site-footer' }, [span({ class: 'brand small' }, 'atelier.'), span('Fait avec soin, servi avec un bon café.'), span({ class: 'muted' }, 'Démo CraftTS · aucune donnée bancaire demandée')]),
  ]);
});
