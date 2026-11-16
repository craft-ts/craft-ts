import {
  a,
  craftComponent,
  footer,
  forNode,
  li,
  p,
  span,
  ul,
  type Input,
} from '@craft-ts/component';
import { FOOTER_LINKS } from '../page-common.js';
import { Page } from './store.js';

const FooterLink = craftComponent(
  'FooterLink',
  {},
  (inputs: { readonly label: Input<string> }) =>
    li(a({ class: 'footer-link', href: '#' }, inputs.label)),
);

const FooterLinks = craftComponent('FooterLinks', {}, () =>
  ul(
    { class: 'footer__links' },
    forNode(FOOTER_LINKS, { track: (label) => label }, (label) =>
      FooterLink({ label }),
    ),
  ),
);

export const Footer = craftComponent('Footer', {}, () =>
  footer({ class: 'footer' }, [
    FooterLinks({}),
    p({ class: 'footer__meta' }, [
      span({ class: 'footer__unread' }, Page.unreadSummary),
      span({ class: 'footer__theme' }, Page.themeLabel),
    ]),
  ]),
);
