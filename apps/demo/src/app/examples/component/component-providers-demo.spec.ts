// @vitest-environment jsdom
import { expect, expectTypeOf, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import type { ComponentDepsOf } from '@craft-ts/core';
import { componentCompositionDemo } from './component-composition-demo';
import { componentProvidersDemo } from './component-providers-demo';

it('provides all the dependencies of the input-bound demo locally', () => {
  expectTypeOf<
    keyof ComponentDepsOf<typeof componentProvidersDemo>['missingProvider']
  >().toEqualTypeOf<never>();
});

it('keeps both counters independent and intact when their profile inputs change', async () => {
  // Exercise the actual page to catch missing integration or parent providers.
  const rendered = await renderCraftComponent(componentCompositionDemo);
  try {
    const first = rendered.element.querySelector(
      '[data-profile-instance="A"]',
    )!;
    const second = rendered.element.querySelector(
      '[data-profile-instance="B"]',
    )!;
    const profile = (card: Element) =>
      card.querySelector('[data-testid="profile-id"]')?.textContent;
    const counter = (card: Element) =>
      card.querySelector('[data-testid="profile-counter"]')?.textContent;
    const click = (container: Element, name: string) =>
      container
        .querySelector<HTMLButtonElement>(`button[data-craft-name="${name}"]`)!
        .click();

    expect(profile(first)).toBe('ada');
    expect(profile(second)).toBe('katherine');
    expect(counter(first)).toBe('0');
    expect(counter(second)).toBe('0');

    click(first, 'incrementProfileCounter');
    click(first, 'incrementProfileCounter');
    click(second, 'incrementProfileCounter');
    await rendered.flush();
    expect(counter(first)).toBe('2');
    expect(counter(second)).toBe('1');

    click(rendered.element, 'changeFirstProfile');
    await rendered.flush();
    expect(profile(first)).toBe('grace');
    expect(profile(second)).toBe('katherine');
    expect(counter(first)).toBe('2');
    expect(counter(second)).toBe('1');

    click(rendered.element, 'changeSecondProfile');
    await rendered.flush();
    expect(profile(first)).toBe('grace');
    expect(profile(second)).toBe('margaret');
    expect(counter(first)).toBe('2');
    expect(counter(second)).toBe('1');

    click(first, 'incrementProfileCounter');
    await rendered.flush();
    expect(counter(first)).toBe('3');
    expect(counter(second)).toBe('1');
  } finally {
    rendered.destroy();
  }
});
