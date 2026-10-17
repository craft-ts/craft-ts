import { describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import { DocTabs, type TabItem } from './tabs.ts';

const reader =
  <T>(value: T) =>
  function* () {
    return value;
  };

const items: readonly TabItem[] = [
  { id: 'npm', label: 'npm', render: () => 'npm install' },
  { id: 'pnpm', label: 'pnpm', render: () => 'pnpm add' },
  { id: 'yarn', label: 'yarn', render: () => 'yarn add' },
];

const render = () =>
  renderCraftComponent(DocTabs as never, {
    props: {
      items: reader(items),
      group: reader('pm'),
      surface: reader('page'),
    } as never,
  });

const tabsOf = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
const panelsOf = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];

describe('DocTabs', () => {
  it('shows the first panel and puts only its tab in the tab order', async () => {
    const rendered = await render();
    const tabs = tabsOf(rendered.element);
    const panels = panelsOf(rendered.element);

    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(panels.map((panel) => panel.hidden)).toEqual([false, true, true]);
    expect(tabs[0]?.getAttribute('aria-controls')).toBe(panels[0]?.id);
    expect(panels[0]?.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
    rendered.destroy();
  });

  it('switches panel on click without replacing the strip that holds focus', async () => {
    const rendered = await render();
    const before = tabsOf(rendered.element);
    before[1]?.click();
    await rendered.flush();

    const after = tabsOf(rendered.element);
    expect(after[1]).toBe(before[1]);
    expect(after.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(panelsOf(rendered.element).map((panel) => panel.hidden)).toEqual([
      true,
      false,
      true,
    ]);
    rendered.destroy();
  });

  it('moves with the arrow keys and wraps around', async () => {
    const rendered = await render();
    const tabs = tabsOf(rendered.element);

    tabs[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    );
    await rendered.flush();
    expect(tabsOf(rendered.element)[2]?.getAttribute('aria-selected')).toBe('true');
    rendered.destroy();
  });
});
