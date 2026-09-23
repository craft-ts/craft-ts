import {
  a,
  craftComponent,
  div,
  footer,
  header,
  main,
  nav,
  small,
  span,
  strong,
  CraftRouterOutlet,
} from '@craft-ts/component';
import { CraftRouterLink } from '@craft-ts/core';
import { shell } from './ssr-lab.style';

const SCENARIOS = [
  ['Overview', { to: '' }],
  ['01 · statique', { to: 'static' }],
  ['02 · requête', { to: 'request' }],
  ['03 · query bloquante', { to: 'data' }],
  ['04 · fallback SSR', { to: 'fallback' }],
  ['05 · client-only', { to: 'client-only' }],
] satisfies readonly (readonly [string, { readonly to: string }])[];

export const App = craftComponent(
  'SsrLabApp',
  {},
  () => ({}),
  () =>
    div({ class: shell.root }, [
      header({ class: shell.masthead }, [
        a('brand', { class: shell.brand }, [
          span({ class: shell.brandMark }, 'S'),
          span([
            strong({ class: shell.brandTitle }, 'SSR lab · CraftTS'),
            small(
              { class: shell.brandTagline },
              'SSR initial · navigation SPA après hydratation',
            ),
          ]),
        ]).pipe(CraftRouterLink({ to: '' })),
        div({ class: shell.serverIndicator }, [
          strong({ class: shell.serverOk }, 'HTML rendu par renderCraft'),
          span('Puis hydraté par hydrateCraft'),
        ]),
      ]),
      nav(
        { class: shell.nav, 'aria-label': 'Scénarios SSR' },
        SCENARIOS.map(([label, link]) =>
          a('scenarioLink', { class: shell.navLink }, label).pipe(
            CraftRouterLink(link),
          ),
        ),
      ),
      main(
        { id: 'main', class: shell.content, tabIndex: -1 },
        CraftRouterOutlet(),
      ),
      footer({ class: shell.footer }, [
        span('SSR lab'),
        span('Chaque route documente sa stratégie de rendu.'),
      ]),
    ]),
);
