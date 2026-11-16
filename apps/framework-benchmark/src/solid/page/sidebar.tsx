import { For, Show } from 'solid-js';
import { SIDEBAR_GROUPS, cx } from '../../page-common.js';
import { usePage } from './store.js';
import { Badge, Icon } from './ui.js';

function SidebarItem(props: { item: any }) {
  const page = usePage();
  return (
    <li
      class={cx(
        'sidebar-item',
        props.item.id === 'dashboard' && 'is-active',
        page.isDark() && 'is-dark',
      )}
    >
      <a href="#">
        <Icon name={props.item.icon} />
        <span class="sidebar-item__label">{props.item.label}</span>
        <Show when={props.item.badge !== undefined}>
          <Badge
            tone={props.item.badge?.kind === 'unread' ? 'danger' : 'neutral'}
            text={
              props.item.badge?.kind === 'static'
                ? props.item.badge.text
                : String(page.model.unread)
            }
          />
        </Show>
      </a>
    </li>
  );
}

function SidebarGroup(props: { group: any }) {
  return (
    <section class="sidebar-group">
      <h3 class="sidebar-group__title">{props.group.title}</h3>
      <ul class="sidebar-group__list">
        <For each={props.group.items}>
          {(item: any) => <SidebarItem item={item} />}
        </For>
      </ul>
    </section>
  );
}

export function Sidebar() {
  const page = usePage();
  return (
    <aside class={cx('sidebar', page.isDark() && 'is-dark')}>
      <nav class="sidebar__nav">
        <For each={SIDEBAR_GROUPS}>
          {(group) => <SidebarGroup group={group} />}
        </For>
      </nav>
    </aside>
  );
}
