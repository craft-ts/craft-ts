import { For } from 'solid-js';
import { FOOTER_LINKS } from '../../page-common.js';
import { usePage } from './store.js';

function FooterLink(props: { label: string }) {
  return (
    <li>
      <a class="footer-link" href="#">
        {props.label}
      </a>
    </li>
  );
}

function FooterLinks() {
  return (
    <ul class="footer__links">
      <For each={FOOTER_LINKS}>{(label) => <FooterLink label={label} />}</For>
    </ul>
  );
}

export function Footer() {
  const page = usePage();
  return (
    <footer class="footer">
      <FooterLinks />
      <p class="footer__meta">
        <span class="footer__unread">{page.unreadSummary()}</span>
        <span class="footer__theme">{`${page.model.theme} theme`}</span>
      </p>
    </footer>
  );
}
