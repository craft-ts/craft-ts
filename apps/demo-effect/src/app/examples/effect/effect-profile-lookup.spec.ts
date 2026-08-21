// @vitest-environment jsdom
// ɵ EffectTS + CraftTS demo — component behavior tests.
//
// Drives the demo page for real: mounts it, clicks each scenario button, and
// reads the DOM. This is what would otherwise be eyeballed in the browser.
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { installCraftEffectBridge } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectYieldComponent from './effect-profile-lookup';

describe('demo: profile lookup with Effect', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  let disposeBridge: () => void;

  beforeEach(() => {
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
  });

  const mount = () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      EffectYieldComponent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    return { element, mounted };
  };

  const clickScenario = async (label: string, element: HTMLElement) => {
    const target = await vi.waitFor(() => {
      const match = Array.from(
        element.querySelectorAll<HTMLButtonElement>('button'),
      ).find((button) => button.textContent?.trim() === label);
      expect(match).toBeDefined();
      return match;
    });
    if (!target) {
      throw new Error(`Scenario button not found: ${label}`);
    }
    target.click();
    TestBed.tick();
  };

  it('loads the profile when the lookup succeeds', async () => {
    const { element, mounted } = mount();

    await clickScenario('Profile available', element);
    expect(element.textContent).toContain('Looking up…');

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Ada Lovelace');
    });

    mounted.destroy();
  });

  it('shows a missing profile as a typed business error', async () => {
    const { element, mounted } = mount();

    await clickScenario('Profile not found', element);

    // The template matched on the discriminant — proof the _tag survived the
    // whole trip from the Effect error to matchBlock.
    await vi.waitFor(() => {
      expect(element.textContent).toContain('UserNotFound');
    });
    expect(element.textContent).not.toContain('Ada Lovelace');

    mounted.destroy();
  });

  it('distinguishes an expired session from a missing profile', async () => {
    const { element, mounted } = mount();

    await clickScenario('Session expired', element);

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Unauthorized');
    });

    mounted.destroy();
  });

  it('keeps a technical outage out of the business channel', async () => {
    const { element, mounted } = mount();

    await clickScenario('Database outage', element);

    await vi.waitFor(() => {
      expect(element.textContent).toContain('View a profile (exception)');
    });
    // A defect is not a business exception: no discriminant match is rendered.
    expect(element.textContent).not.toContain('UserNotFound');

    mounted.destroy();
  });
});
