import {
  button,
  craftComponent,
  div,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { tabsUi } from './tabs.style.ts';

export interface TabItem {
  /** Unique within its group. */
  readonly id: string;
  readonly label: string;
  /** The panel body, built when the tabs are. */
  readonly render: () => CraftNodeChild;
}

export type TabsSurface = 'page' | 'code';

export interface TabsInput {
  readonly items: Input<readonly TabItem[]>;
  /** Names the group, so the ids of two groups on a page never collide. */
  readonly group: Input<string>;
  readonly surface: Input<TabsSurface>;
}

/** Which tab shows: the one piece of state a group of tabs owns. */
export const { DocTabsView, provideDocTabsView } = craftService(
  { name: 'docTabsView', providedIn: 'toProvide' },
  function* () {
    const selected = yield* state('selected', 0, ({ update }) => ({
      select: (index: number) => update(() => index),
    }));
    yield* craftExpose('select', selected.select);
  },
);

const KEYS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

/**
 * Tabs as the ARIA pattern has them: a tablist of buttons, one tabpanel shown,
 * arrow keys move between tabs, and only the selected tab is in the tab order.
 * The structure is built once; selection flows through attribute readers, so
 * pressing a tab does not replace the DOM that holds focus.
 */
export const DocTabs = craftComponent(
  'DocTabs',
  { providers: [provideDocTabsView()] },
  function* (input: TabsInput) {
    const view = yield* DocTabsView();
    const items = yield* input.items();
    const group = yield* input.group();

    const isSelected = (index: number) =>
      function* () {
        return (yield* view.selected()) === index;
      };

    const tabs = items.map((item, index): CraftNodeChild =>
      button(
        `tab-${item.id}`,
        {
          type: 'button',
          class: tabsUi.tab,
          role: 'tab',
          id: `${group}-tab-${item.id}`,
          'aria-controls': `${group}-panel-${item.id}`,
          'data-surface': input.surface,
          'aria-selected': function* () {
            return (yield* isSelected(index)()) ? 'true' : 'false';
          },
          'data-selected': function* () {
            return (yield* isSelected(index)()) ? 'true' : 'false';
          },
          tabindex: function* () {
            return (yield* isSelected(index)()) ? 0 : -1;
          },
          click: () => view.select(index),
          keydown: (event) => {
            const step = KEYS[event.key];
            if (step === undefined) return;
            event.preventDefault();
            const next = (index + step + items.length) % items.length;
            view.select(next);
            const list = (event.currentTarget as HTMLElement).parentElement;
            list?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
          },
        },
        item.label,
      ),
    );

    const panels = items.map((item, index): CraftNodeChild =>
      div(
        {
          class: tabsUi.panel,
          role: 'tabpanel',
          id: `${group}-panel-${item.id}`,
          'aria-labelledby': `${group}-tab-${item.id}`,
          hidden: function* () {
            return !(yield* isSelected(index)());
          },
        },
        [item.render()],
      ),
    );

    return div({ class: tabsUi.root }, [
      div(
        { class: tabsUi.list, role: 'tablist', 'data-surface': input.surface },
        tabs,
      ),
      ...panels,
    ]);
  },
);
