import { a, craftComponent, span, type CraftNodeChild, type Input } from '@craft-ts/component';
import { DocIcon, type IconName } from '../icon/icon.ts';
import { navLinkUi } from './nav.style.ts';

export interface NavLinkInput {
  readonly label: Input<string>;
  readonly href: Input<string>;
  /** This is the page being read. Announced as `aria-current="page"`. */
  readonly current: Input<boolean>;
  /** A glyph before the label. Empty means none. */
  readonly icon: Input<IconName | ''>;
}

/**
 * A row of the sidebar. The current page is `aria-current="page"` and the sheet
 * reads that attribute: the highlight is the announcement.
 */
export const DocNavLink = craftComponent('DocNavLink', {}, function* (
  input: NavLinkInput,
) {
  const label = yield* input.label();
  const href = yield* input.href();
  const current = yield* input.current();
  const icon = yield* input.icon();

  const parts: CraftNodeChild[] = [];
  if (icon) {
    parts.push(
      DocIcon({
        name: function* () {
          return icon;
        },
        size: function* () {
          return 'sm' as const;
        },
      }),
    );
  }
  parts.push(span(label));
  return a(
    'docNavLink',
    {
      class: navLinkUi.root,
      href,
      ...(current ? { 'aria-current': 'page' as const } : {}),
    },
    parts,
  );
});
