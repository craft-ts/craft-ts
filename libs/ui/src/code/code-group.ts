import { craftComponent, type CraftNodeChild, type Input } from '@craft-ts/component';
import { DocTabs, type TabItem } from '../tabs/tabs.ts';

export interface CodeGroupTab {
  /** The tab's label: the `[name]` of the fence, or its language. */
  readonly label: string;
  readonly render: () => CraftNodeChild;
}

export interface CodeGroupInput {
  readonly tabs: Input<readonly CodeGroupTab[]>;
  /** Names the group on the page (`code-group-2`), for the ARIA ids. */
  readonly group: Input<string>;
}

const slug = (label: string, index: number): string =>
  `${index}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tab'}`;

/**
 * A group of code blocks under one strip of tabs, as `::: code-group` writes
 * it: the package-manager switch, the same snippet in two languages. Each tab
 * holds a whole `DocCode`, with its own Copy button, so what is copied is what
 * is showing.
 */
export const DocCodeGroup = craftComponent('DocCodeGroup', {}, function* (
  input: CodeGroupInput,
) {
  const tabs = yield* input.tabs();
  const items: readonly TabItem[] = tabs.map((tab, index) => ({
    id: slug(tab.label, index),
    label: tab.label,
    render: tab.render,
  }));
  return DocTabs({
    items: function* () {
      return items;
    },
    group: input.group,
    surface: function* () {
      return 'code' as const;
    },
  });
});
