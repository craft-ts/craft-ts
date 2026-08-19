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

const NAV_LINKS = [
  ['Authenticated list', { to: '' }],
  ['Simple list', { to: 'simple-list' }],
  ['Portable middleware', { to: 'portable' }],
  ['Effect middleware', { to: 'effect-middleware' }],
] as const;

const AppShell = craftComponent(
  'AppShell',
  {
    styles: `
      :scope { display: block; min-height: 100vh; }
      .demo-nav { display: flex; gap: 8px; padding: 14px 20px; background: #0b1020; border-bottom: 1px solid #273351; }
      .demo-nav a { padding: 8px 14px; border-radius: 8px; color: #aab6cf; font: 700 .82rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-decoration: none; }
      .demo-nav a:hover { color: #fff; background: #18233d; }
      .demo-nav a[aria-current="page"] { color: #0b1020; background: #9fb5ff; }
    `,
  },
  function* () {
    return {};
  },
  () =>
    div([
      nav({ class: 'demo-nav' }, [
        ...NAV_LINKS.map(([label, link]) =>
          a(`navLink-${link.to}`, { craftRouterLink: link }, label).pipe(
            CraftRouterLink,
          ),
        ),
      ]),
      main(CraftRouterOutlet()),
    ]),
);

export { AppShell };
