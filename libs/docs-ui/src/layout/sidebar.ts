import {
  aside,
  craftComponent,
  details,
  div,
  li,
  nav,
  p,
  span,
  summary,
  ul,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { DocNavLink } from '../nav/nav-link.ts';
import {
  holds,
  isCurrent,
  isMenu,
  roman,
  withBase,
  type NavEntry,
  type SidebarEntry,
} from '../site/site.ts';
import { sidebarUi } from './sidebar.style.ts';

export interface SidebarInput {
  readonly entries: Input<readonly SidebarEntry[]>;
  /** The top sections, repeated in the drawer on a phone. */
  readonly sections: Input<readonly NavEntry[]>;
  readonly path: Input<string>;
  readonly base: Input<string>;
  /** Names the landmark. */
  readonly label: Input<string>;
  /** The drawer is open. Below `md` the sidebar shows only then. */
  readonly open: Input<boolean>;
}

const row = (entry: SidebarEntry, path: string, base: string): CraftNodeChild =>
  li([
    DocNavLink({
      label: function* () {
        return entry.text;
      },
      href: function* () {
        return withBase(base, entry.link ?? '#');
      },
      current: function* () {
        return entry.link ? isCurrent(entry.link, path, base) : false;
      },
      icon: function* () {
        return '' as const;
      },
    }),
  ]);

const items = (
  entries: readonly SidebarEntry[],
  path: string,
  base: string,
): CraftNodeChild[] =>
  entries.map((entry): CraftNodeChild => {
    if (!entry.items) return row(entry, path, base);
    // A group inside a group: a `<details>`, open when it holds the page.
    return li([
      details(
        {
          class: sidebarUi.nested,
          ...(holds(entry, path, base) || !entry.collapsed
            ? { open: true }
            : {}),
        },
        [
          summary({ class: sidebarUi.summary }, entry.text),
          ul({ class: sidebarUi.list }, items(entry.items, path, base)),
        ],
      ),
    ]);
  });

/**
 * The sidebar of a section. Top-level groups are numbered in Roman numerals;
 * a link at the top level (the section's overview) stands on its own. The
 * current row is `aria-current="page"` on its link, from `DocNavLink`.
 */
export const DocSidebar = craftComponent('DocSidebar', {}, function* (
  props: SidebarInput,
) {
  const entries = yield* props.entries();
  const sections = yield* props.sections();
  const path = yield* props.path();
  const base = yield* props.base();
  const label = yield* props.label();

  let count = 0;
  const groups = entries.map((entry): CraftNodeChild => {
    if (!entry.items) {
      return div({ class: sidebarUi.group }, [
        ul({ class: sidebarUi.list }, [row(entry, path, base)]),
      ]);
    }
    count += 1;
    const label = [
      span({ class: sidebarUi.numeral, 'aria-hidden': 'true' }, roman(count)),
      span(entry.text),
    ];
    // A group that declares `collapsed` can fold, open by itself when it holds
    // the page. One that does not is a plain section with a label.
    if (entry.collapsed !== undefined) {
      return details(
        {
          class: sidebarUi.group,
          ...(!entry.collapsed || holds(entry, path, base) ? { open: true } : {}),
        },
        [
          summary({ class: sidebarUi.disclosure }, label),
          ul({ class: sidebarUi.list }, items(entry.items, path, base)),
        ],
      );
    }
    return div({ class: sidebarUi.group }, [
      p({ class: sidebarUi.heading }, label),
      ul({ class: sidebarUi.list }, items(entry.items, path, base)),
    ]);
  });

  const mobile: CraftNodeChild[] = sections.map((section) =>
    row(
      isMenu(section)
        ? { text: section.text, link: section.items[0]?.link ?? '#' }
        : { text: section.text, link: section.link },
      path,
      base,
    ),
  );

  return aside(
    {
      class: sidebarUi.root,
      'aria-label': label,
      'data-open': function* () {
        return (yield* props.open()) ? 'true' : 'false';
      },
    },
    [
      nav({ 'aria-label': label }, [
        div({ class: sidebarUi.mobile }, [
          ul({ class: sidebarUi.list }, mobile),
          div({ class: sidebarUi.rule }),
        ]),
        div({ class: sidebarUi.groups }, groups),
      ]),
    ],
  );
});

