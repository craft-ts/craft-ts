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
import { shell } from './effect-demo.style';

const EXAMPLE_LINKS = [
  ['View a profile', { to: '' }],
  ['Check access rights', { to: 'access' }],
  ['Team overview', { to: 'team' }],
  ['Effect playground', { to: 'playground' }],
  ['Run an Effect function', { to: 'effect-function' }],
  ['Sync vs async members', { to: 'sync-members' }],
  ['Translate in an Effect', { to: 'i18n' }],
] satisfies readonly (readonly [string, CraftRouterLinkInput])[];

export const App = craftComponent(
  'App',
  {},
  function* () {
    return {};
  },
  () =>
    div({ class: shell.root }, [
      div({ class: shell.header }, [
        heading({ class: shell.title }, 'Users & access — EffectTS + CraftTS'),
        p(
          { class: shell.tagline },
          'A small business flow showing where Effect fits into a CraftTS application.',
        ),
      ]),
      nav(
        { class: shell.nav, 'aria-label': 'EffectTS examples' },
        EXAMPLE_LINKS.map(([label, link]) =>
          a('exampleLink', { class: shell.navLink }, label).pipe(
            CraftRouterLink(link),
          ),
        ),
      ),
      main({ class: shell.content }, headingSection(CraftRouterOutlet())),
    ]),
);
