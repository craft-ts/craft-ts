import {
  a,
  button,
  craftComponent,
  div,
  header,
  nav,
  span,
  type CraftNodeChild,
  type Input,
  type Output,
} from '@craft-ts/component';
import { DocBadge } from '../badge/badge.ts';
import { DocIcon } from '../icon/icon.ts';
import { DocMenu } from '../menu/menu.ts';
import { isActiveNav, isMenu, withBase, type NavEntry } from '../site/site.ts';
import { DocKbd } from '../button/kbd.ts';
import { DocModeToggle } from './mode.ts';
import { navbarUi } from './navbar.style.ts';

export interface NavbarInput {
  /** The name beside the mark. */
  readonly brand: Input<string>;
  readonly links: Input<readonly NavEntry[]>;
  /** The page being read, for the current section. */
  readonly path: Input<string>;
  /** Where the site is mounted: `/craft/`. */
  readonly base: Input<string>;
  /** A status word beside the tools (`BETA`). Empty means none. */
  readonly badge: Input<string>;
  readonly searchLabel: Input<string>;
  readonly modeLabel: Input<string>;
  readonly menuLabel: Input<string>;
  readonly openSearch: Output<() => void>;
  readonly toggleNav: Output<() => void>;
  /** The drawer is open: announced on the menu button. */
  readonly navOpen: Input<boolean>;
}

const glyph = (name: 'search' | 'menu') =>
  DocIcon({
    name: function* () {
      return name;
    },
    size: function* () {
      return 'md' as const;
    },
  });

/**
 * The bar across the top. The current section is `aria-current="page"`, and the
 * search is a button that opens the search dialog: it is shaped like a field
 * because that is what it stands for, and it is a button because pressing it
 * opens something else.
 */
export const DocNavbar = craftComponent('DocNavbar', {}, function* (
  props: NavbarInput,
) {
  const brand = yield* props.brand();
  const links = yield* props.links();
  const path = yield* props.path();
  const base = yield* props.base();
  const badge = yield* props.badge();
  const searchLabel = yield* props.searchLabel();

  const entries = links.map((entry, index): CraftNodeChild =>
    isMenu(entry)
      ? DocMenu({
          label: function* () {
            return entry.text;
          },
          menuId: function* () {
            return `nav-menu-${index}`;
          },
          items: function* () {
            return entry.items.map((item) => ({
              label: item.text,
              href: withBase(base, item.link),
              hint: '',
            }));
          },
        })
      : a(
          'docNavbarLink',
          {
            class: navbarUi.link,
            href: withBase(base, entry.link),
            ...(isActiveNav(entry, path, base)
              ? { 'aria-current': 'page' as const }
              : {}),
          },
          entry.text,
        ),
  );

  return header({ class: navbarUi.root }, [
    a('docNavbarBrand', { class: navbarUi.brand, href: withBase(base, '/') }, [
      span({ class: navbarUi.mark, 'aria-hidden': 'true' }, [
        DocIcon({
          name: function* () {
            return 'spruce' as const;
          },
          size: function* () {
            return 'md' as const;
          },
        }),
      ]),
      span({ class: navbarUi.name }, brand),
    ]),
    nav({ class: navbarUi.links, 'aria-label': 'Sections' }, entries),
    div({ class: navbarUi.tools }, [
      button(
        'docSearchButton',
        {
          type: 'button',
          class: navbarUi.search,
          'aria-label': searchLabel,
          'aria-keyshortcuts': 'Control+K Meta+K',
          click: () => props.openSearch(),
        },
        [
          span({ class: navbarUi.searchLabel }, [
            glyph('search'),
            span({ class: navbarUi.searchText }, searchLabel),
          ]),
          span({ class: navbarUi.searchKeys, 'aria-hidden': 'true' }, [
            DocKbd({
              keys: function* () {
                return '⌘K';
              },
            }),
          ]),
        ],
      ),
      ...(badge
        ? [
            DocBadge({
              tone: function* () {
                return 'important' as const;
              },
              label: function* () {
                return badge;
              },
            }),
          ]
        : []),
      DocModeToggle({ label: props.modeLabel }),
      button(
        'docNavToggle',
        {
          type: 'button',
          class: navbarUi.menu,
          'aria-label': props.menuLabel,
          'aria-expanded': function* () {
            return (yield* props.navOpen()) ? 'true' : 'false';
          },
          click: () => props.toggleNav(),
        },
        [glyph('menu')],
      ),
    ]),
  ]);
});
