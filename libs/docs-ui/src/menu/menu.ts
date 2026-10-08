import {
  a,
  button,
  craftComponent,
  div,
  span,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import {
  craftExpose,
  craftService,
  fromEventToSource$,
  state,
  type CraftServiceInput,
} from '@craft-ts/core';
import { DocIcon } from '../icon/icon.ts';
import { NAVIGATED_EVENT } from '../site/navigated.ts';
import { menuUi } from './menu.style.ts';

export interface MenuItem {
  readonly label: string;
  readonly href: string;
  /** A word or a shortcut at the far end of the row. Empty means none. */
  readonly hint: string;
}

export interface MenuInput {
  /** The button's text. */
  readonly label: Input<string>;
  /** Ties the button to its panel. Unique on the page. */
  readonly menuId: Input<string>;
  readonly items: Input<readonly MenuItem[]>;
}

/**
 * Whether the panel shows, and what closes it: a press anywhere outside the
 * menu and Escape. The subscriptions belong to the service, so a rerender keeps
 * the ones the first render opened. They are not set up on the server, where
 * there is no document to listen to.
 */
export const { DocMenuView, provideDocMenuView } = craftService(
  { name: 'docMenuView', providedIn: 'toProvide' },
  function* (inputs: { readonly menuId: CraftServiceInput<string> }) {
    const menuId = yield* inputs.menuId();
    const open = yield* state('open', false, ({ update }) => ({
      toggle: () => update((value) => !value),
      close: () => update(() => false),
    }));
    if (typeof document !== 'undefined') {
      fromEventToSource$<PointerEvent>(document, 'pointerdown').subscribe(
        (event) => {
          const inside = (event.target as Element | null)?.closest(
            `[data-doc-menu="${menuId}"]`,
          );
          if (!inside) open.close();
        },
      );
      fromEventToSource$<KeyboardEvent>(document, 'keydown').subscribe(
        (event) => {
          if (event.key === 'Escape') open.close();
        },
      );
      fromEventToSource$<Event>(document, NAVIGATED_EVENT).subscribe(() => open.close());
    }
    yield* craftExpose('toggle', open.toggle);
    yield* craftExpose('close', open.close);
  },
);

/**
 * A button that opens a list of links. The button says it is expanded
 * (`aria-expanded`) and what it opens (`aria-controls`); the list is a
 * `role="menu"` of `menuitem` links. Escape and a press elsewhere close it.
 */
export const DocMenu = craftComponent(
  'DocMenu',
  { providers: [provideDocMenuView()] },
  function* (props: MenuInput) {
    const view = yield* DocMenuView({ menuId: props.menuId });
    const id = yield* props.menuId();
    const label = yield* props.label();
    const items = yield* props.items();
    const isOpen = function* () {
      return (yield* view.open()) ? 'true' : 'false';
    };

    const rows = items.map(
      (item): CraftNodeChild =>
        a(
          'docMenuItem',
          {
            class: menuUi.item,
            role: 'menuitem',
            href: item.href,
            click: () => view.close(),
          },
          [
            span(item.label),
            ...(item.hint ? [span({ class: menuUi.hint }, item.hint)] : []),
          ],
        ),
    );

    return div({ class: menuUi.root, 'data-doc-menu': id }, [
      button(
        'docMenuTrigger',
        {
          type: 'button',
          class: menuUi.trigger,
          'aria-haspopup': 'menu',
          'aria-controls': `${id}-panel`,
          'aria-expanded': isOpen,
          click: () => view.toggle(),
        },
        [
          span(label),
          DocIcon({
            name: function* () {
              return 'chevron' as const;
            },
            size: function* () {
              return 'sm' as const;
            },
          }),
        ],
      ),
      div(
        {
          class: menuUi.panel,
          id: `${id}-panel`,
          role: 'menu',
          'aria-label': label,
          'data-menu-state': function* () {
            return (yield* view.open()) ? 'open' : 'closed';
          },
        },
        rows,
      ),
    ]);
  },
);
