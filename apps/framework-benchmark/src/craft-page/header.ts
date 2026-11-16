import {
  a,
  button,
  craftComponent,
  div,
  forNode,
  header,
  ifNode,
  input,
  li,
  nav,
  span,
  ul,
  type Input,
} from '@craft-ts/component';
import { MENU_ITEMS, NAV_LINKS, cx } from '../page-common.js';
import { CurrentUser, Page } from './store.js';
import {
  Avatar,
  Badge,
  Icon,
  IconButton,
  derive,
  fixed,
  pluck,
} from './ui.js';

const Brand = craftComponent('Brand', {}, () =>
  a({ class: 'brand', href: '#' }, 'Craft Admin'),
);

const NavLink = craftComponent(
  'NavLink',
  {},
  (inputs: {
    readonly link: Input<{ readonly id: string; readonly label: string; readonly active: boolean }>;
  }) =>
    a(
      {
        class: function* () {
          return cx('nav-link', (yield* inputs.link()).active && 'is-active');
        },
        href: '#',
      },
      pluck(inputs.link, 'label'),
    ),
);

const SearchBox = craftComponent('SearchBox', {}, () =>
  div({ class: 'search' }, [
    Icon({ name: fixed('search') }),
    input('searchInput', {
      type: 'search',
      class: 'search__input',
      placeholder: 'Search people, tasks…',
      value: Page.search,
      *input(event) {
        yield* Page.model.dispatch({
          type: 'search',
          value: event.target.value,
        });
      },
    }),
    ifNode(Page.hasSearch, () =>
      IconButton({
        icon: fixed('close'),
        label: fixed('Clear search'),
        action: fixed({ type: 'search', value: '' }),
        active: fixed(false),
      }),
    ),
  ]),
);

const NotificationBell = craftComponent('NotificationBell', {}, () =>
  button(
    'bell',
    {
      type: 'button',
      class: 'bell',
      'aria-label': 'Notifications',
      *click() {
        yield* Page.model.dispatch('read-all');
      },
    },
    [
      Icon({ name: fixed('bell') }),
      ifNode(Page.hasUnread, () =>
        Badge({ tone: fixed('danger'), text: Page.unreadText }),
      ),
    ],
  ),
);

const MenuItem = craftComponent(
  'MenuItem',
  {},
  (inputs: { readonly item: Input<{ readonly id: string; readonly label: string }> }) =>
    li({ class: 'menu-item' }, a({ href: '#' }, pluck(inputs.item, 'label'))),
);

const UserMenu = craftComponent('UserMenu', {}, () =>
  div({ class: 'user-menu' }, [
    button(
      'userMenuToggle',
      {
        type: 'button',
        class: 'user-menu__toggle',
        *click() {
          yield* Page.model.dispatch('toggle-menu');
        },
      },
      [
        Avatar({ name: CurrentUser.userName, size: fixed('sm') }),
        span({ class: 'user-menu__name' }, CurrentUser.userName),
      ],
    ),
    ifNode(Page.menuOpen, () =>
      ul(
        { class: 'user-menu__list' },
        forNode(MENU_ITEMS, { track: (item) => item.id }, (item) =>
          MenuItem({ item }),
        ),
      ),
    ),
  ]),
);

export const Header = craftComponent('Header', {}, () =>
  header({ class: 'header' }, [
    Brand({}),
    nav(
      { class: 'header__nav' },
      forNode(NAV_LINKS, { track: (link) => link.id }, (link) =>
        NavLink({ link }),
      ),
    ),
    SearchBox({}),
    NotificationBell({}),
    UserMenu({}),
  ]),
);

void derive;
