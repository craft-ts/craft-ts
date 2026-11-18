import {
  a,
  aside,
  craftComponent,
  forNode,
  h3,
  ifNode,
  li,
  nav,
  section,
  span,
  ul,
  type Input,
} from '@craft-ts/component';
import { SIDEBAR_GROUPS, cx, type NavItem } from '../page-common.js';
import { Page } from './store.js';
import { Badge, Icon, derive, pluck } from './ui.js';

type Group = {
  readonly id: string;
  readonly title: string;
  readonly items: readonly NavItem[];
};

const SidebarItem = craftComponent(
  'SidebarItem',
  {},
  (inputs: { readonly item: Input<NavItem> }) =>
    li(
      {
        class: function* () {
          return cx(
            'sidebar-item',
            (yield* inputs.item()).id === 'dashboard' && 'is-active',
            (yield* Page.isDark()) && 'is-dark',
          );
        },
      },
      a({ href: '#' }, [
        Icon({ name: pluck(inputs.item, 'icon') }),
        span({ class: 'sidebar-item__label' }, pluck(inputs.item, 'label')),
        ifNode(
          'hasBadge',
          function* () {
            return (yield* inputs.item()).badge !== undefined;
          },
          () =>
            Badge({
              tone: derive(inputs.item, (item) =>
                item.badge?.kind === 'unread' ? 'danger' : 'neutral',
              ),
              text: function* () {
                const badge = (yield* inputs.item()).badge;
                if (badge?.kind === 'static') return badge.text;
                return String(yield* Page.unread());
              },
            }),
        ),
      ]),
    ),
);

const SidebarGroup = craftComponent(
  'SidebarGroup',
  {},
  (inputs: { readonly group: Input<Group> }) =>
    section({ class: 'sidebar-group' }, [
      h3({ class: 'sidebar-group__title' }, pluck(inputs.group, 'title')),
      ul(
        { class: 'sidebar-group__list' },
        forNode(
          pluck(inputs.group, 'items'),
          { track: (item) => item.id },
          (item) => SidebarItem({ item }),
        ),
      ),
    ]),
);

export const Sidebar = craftComponent('Sidebar', {}, () =>
  aside(
    {
      class: function* () {
        return cx('sidebar', (yield* Page.isDark()) && 'is-dark');
      },
    },
    nav(
      { class: 'sidebar__nav' },
      forNode(SIDEBAR_GROUPS, { track: (group) => group.id }, (group) =>
        SidebarGroup({ group }),
      ),
    ),
  ),
);
