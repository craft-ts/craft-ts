/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo shell styles. */
import {
  a,
  CraftRouterOutlet,
  craftComponent,
  div,
  heading,
  headingSection,
  main,
  nav,
  p,
} from '@craft-ts/component';
import { CraftRouterLink, type CraftRouterLinkInput } from '@craft-ts/core';

const EXAMPLE_LINKS = [
  ['View a profile', { to: '' }],
  ['Check access rights', { to: 'access' }],
  ['Team overview', { to: 'team' }],
  ['Run an Effect function', { to: 'effect-function' }],
  ['Sync vs async members', { to: 'sync-members' }],
] as const satisfies readonly (readonly [string, CraftRouterLinkInput])[];

export const App = craftComponent(
  'App',
  {
    styles: `
      :scope { display: block; min-height: 100vh; }
      .app-header { padding: 1.5rem 2rem 0; }
      .app-header h1 { margin: 0; color: #0f172a; font-size: 1.35rem; }
      .app-header p { margin: 0.35rem 0 0; color: #64748b; font-size: 0.9rem; }
      .app-nav { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 1rem 2rem; }
      .app-nav a { padding: 0.45rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 999px; color: #475569; background: #fff; font-size: 0.85rem; text-decoration: none; }
      .app-nav a:hover { color: #0f172a; background: #f1f5f9; }
      .app-nav a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .app-content { padding: 0 1rem 2rem; }
    `,
  },
  function* () {
    return {};
  },
  () =>
    div([
      div({ class: 'app-header' }, [
        heading('Users & access — EffectTS + CraftTS'),
        p(
          'A small business flow showing where Effect fits into a CraftTS application.',
        ),
      ]),
      nav(
        { class: 'app-nav', 'aria-label': 'EffectTS examples' },
        EXAMPLE_LINKS.map(([label, link]) =>
          a('exampleLink', { craftRouterLink: link }, label).pipe(
            CraftRouterLink,
          ),
        ),
      ),
      main({ class: 'app-content' }, headingSection(CraftRouterOutlet())),
    ]),
);
