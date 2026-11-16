import { For, Show } from 'solid-js';
import { MENU_ITEMS, NAV_LINKS, cx } from '../../page-common.js';
import { useCurrentUser, usePage } from './store.js';
import { Avatar, Badge, Icon, IconButton } from './ui.js';

function Brand() {
  return (
    <a class="brand" href="#">
      Craft Admin
    </a>
  );
}

function NavLink(props: { link: { id: string; label: string; active: boolean } }) {
  return (
    <a class={cx('nav-link', props.link.active && 'is-active')} href="#">
      {props.link.label}
    </a>
  );
}

function SearchBox() {
  const page = usePage();
  return (
    <div class="search">
      <Icon name="search" />
      <input
        type="search"
        class="search__input"
        placeholder="Search people, tasks…"
        value={page.model.search}
        onInput={(event) =>
          page.dispatch({ type: 'search', value: event.currentTarget.value })
        }
      />
      <Show when={page.model.search !== ''}>
        <IconButton
          icon="close"
          label="Clear search"
          action={{ type: 'search', value: '' }}
          active={false}
        />
      </Show>
    </div>
  );
}

function NotificationBell() {
  const page = usePage();
  return (
    <button
      type="button"
      class="bell"
      aria-label="Notifications"
      onClick={() => page.dispatch('read-all')}
    >
      <Icon name="bell" />
      <Show when={page.model.unread > 0}>
        <Badge tone="danger" text={String(page.model.unread)} />
      </Show>
    </button>
  );
}

function MenuItem(props: { item: { id: string; label: string } }) {
  return (
    <li class="menu-item">
      <a href="#">{props.item.label}</a>
    </li>
  );
}

function UserMenu() {
  const page = usePage();
  const user = useCurrentUser();
  return (
    <div class="user-menu">
      <button
        type="button"
        class="user-menu__toggle"
        onClick={() => page.dispatch('toggle-menu')}
      >
        <Avatar name={user.userName()} size="sm" />
        <span class="user-menu__name">{user.userName()}</span>
      </button>
      <Show when={page.model.menuOpen}>
        <ul class="user-menu__list">
          <For each={MENU_ITEMS}>{(item) => <MenuItem item={item} />}</For>
        </ul>
      </Show>
    </div>
  );
}

export function Header() {
  return (
    <header class="header">
      <Brand />
      <nav class="header__nav">
        <For each={NAV_LINKS}>{(link) => <NavLink link={link} />}</For>
      </nav>
      <SearchBox />
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
