/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  a,
  craftComponent,
  nav,
} from '@craft-ts/component';
import { CraftRouterLink, type CraftRouterLinkInput } from '@craft-ts/core';

const CSS_VARS_LINKS = [
  ['Overview', { to: 'css-vars' }],
  ['Required and optional', { to: 'css-vars/required' }],
  ['Inheritance', { to: 'css-vars/inheritance' }],
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
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  () => ({}),
  () =>
    nav(
      { 'aria-label': 'CSS variable examples' },
      CSS_VARS_LINKS.map(([label, link]) =>
        a('link', { craftRouterLink: link }, label).pipe(CraftRouterLink),
      ),
    ),
);
