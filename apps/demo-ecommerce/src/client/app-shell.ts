import { a, craftComponent, CraftRouterOutlet, div, header, main, nav } from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';

const link = (id: string, label: string, to: string) => a(id, {}, label).pipe(CraftRouterLink({ to }));

export const AppShell = craftComponent('EcommerceAppShell', {}, () =>
  div({ class: 'app-shell' }, [
    header({ class: 'topbar' }, [
      a('brand', { class: 'brand' }, 'atelier.').pipe(CraftRouterLink({ to: '' })),
      nav({ class: 'main-nav' }, [link('home', 'Accueil', ''), link('shop', 'La boutique', 'catalogue'), link('cart', 'Panier', 'panier'), link('admin', 'Administration', 'admin')]),
      div({ class: 'top-note' }, 'CAFÉ · PÂTISSERIE · BONNES CHOSES'),
    ]),
    main({ class: 'page' }, CraftRouterOutlet()),
    div({ class: 'site-footer' }, 'Fait avec soin, servi avec un bon café. · Paiement de démonstration'),
  ]),
);
