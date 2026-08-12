import { a, craftComponent, nav } from '@craft-ng/component';
import { CraftRouterLink, type CraftRouterLinkInput } from '@craft-ng/core';

const CSS_VARS_LINKS = [
  ['Vue d’ensemble', { to: 'css-vars' }],
  ['Requis et optionnels', { to: 'css-vars/required' }],
  ['Héritage', { to: 'css-vars/inheritance' }],
  ['Forwarding', { to: 'css-vars/forwarding' }],
  ['@property', { to: 'css-vars/property' }],
] as const satisfies readonly (readonly [string, CraftRouterLinkInput])[];

export const CssVarsPageNav = craftComponent(
  'CssVarsPageNav',
  {
    styles: `
      :scope { display: flex; flex-wrap: wrap; gap: .5rem; }
      a {
        padding: .4rem .7rem;
        border: 1px solid #dbe3f0;
        border-radius: 999px;
        color: #475569;
        background: #ffffff;
        text-decoration: none;
        font-size: .82rem;
        font-weight: 650;
      }
      a:hover { color: #172033; background: #f8fafc; }
    `,
  },
  () => ({}),
  () =>
    nav(
      { 'aria-label': 'Exemples de variables CSS' },
      CSS_VARS_LINKS.map(([label, link]) =>
        a({ craftRouterLink: link }, label).pipe(CraftRouterLink),
      ),
    ),
);
