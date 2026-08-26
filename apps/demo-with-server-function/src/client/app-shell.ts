/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  a,
  craftComponent,
  CraftRouterOutlet,
  div,
  main,
  nav,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';

const AppShell = craftComponent(
  'AppShell',
  {
    styles: `
      :scope { display: block; min-height: 100vh; background: #f6f7fb; }
      .demo-nav { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 12px max(20px, calc((100% - 1120px) / 2)); border-bottom: 1px solid #e5e8f0; background: #fff; }
      .demo-nav::before { content: 'Server Functions'; margin-right: 18px; color: #172033; font-size: .85rem; font-weight: 800; letter-spacing: -.01em; }
      .demo-nav a { padding: 8px 11px; border-radius: 7px; color: #68738a; font-size: .78rem; font-weight: 650; text-decoration: none; transition: color .15s ease, background .15s ease; }
      .demo-nav a:hover { color: #172033; background: #f1f3f8; }
      .demo-nav a[aria-current="page"] { color: #3159c8; background: #edf2ff; }
      @media (max-width: 620px) { .demo-nav::before { width: 100%; margin: 0 0 3px; } }
    `,
  },
  function* () {
    return {};
  },
  () =>
    div([
      nav({ class: 'demo-nav' }, [
        a('navLinkPublicProducts', {}, 'Public products').pipe(
          CraftRouterLink({ to: '' }),
        ),
        a('navLinkAuthenticatedList', {}, 'Authenticated list').pipe(
          CraftRouterLink({ to: 'authenticated-list' }),
        ),
        a('navLinkSimpleUsers', {}, 'Simple users').pipe(
          CraftRouterLink({ to: 'simple-list' }),
        ),
        a('navLinkPortable', {}, 'Portable middleware').pipe(
          CraftRouterLink({ to: 'portable' }),
        ),
        a('navLinkEffectMiddleware', {}, 'Effect middleware').pipe(
          CraftRouterLink({ to: 'effect-middleware' }),
        ),
      ]),
      main(CraftRouterOutlet()),
    ]),
);

export { AppShell };
