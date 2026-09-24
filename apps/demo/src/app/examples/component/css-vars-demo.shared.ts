import { a, craftComponent, nav } from '@craft-ts/component';
import { CraftRouterLink, type CraftRouterLinkInput } from '@craft-ts/core';
import { cssVarsDemo } from './css-vars.style';

const CSS_VARS_LINKS = [
  ['Overview', { to: 'css-vars' }],
  ['Per instance', { to: 'css-vars/required' }],
  ['Inheritance', { to: 'css-vars/inheritance' }],
  ['Forwarding', { to: 'css-vars/forwarding' }],
  ['@property', { to: 'css-vars/property' }],
] satisfies readonly (readonly [string, CraftRouterLinkInput])[];

export const CssVarsPageNav = craftComponent(
  'CssVarsPageNav',
  {},
  () => ({}),
  () =>
    nav(
      { class: cssVarsDemo.nav, 'aria-label': 'CSS variable examples' },
      CSS_VARS_LINKS.map(([label, link]) =>
        a('link', { class: cssVarsDemo.navLink }, label).pipe(
          CraftRouterLink(link),
        ),
      ),
    ),
);
