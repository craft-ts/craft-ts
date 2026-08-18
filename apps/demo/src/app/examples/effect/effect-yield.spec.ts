// @vitest-environment jsdom
// ɵ WAVE-0 EFFECT PROTOTYPE — THROWAWAY (plan task 0.1).
//
// Drives the demo page for real: mounts it, clicks each scenario button, and
// reads the DOM. This is what would otherwise be eyeballed in the browser.
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EffectYieldComponent from './effect-yield';

describe('demo: yield* Effect in a craft loader', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
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
    target!.click();
    TestBed.tick();
  };

  const traceText = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('.effect-trace li'))
      .map((entry) => entry.textContent ?? '')
      .join('\n');

  it('resumes the loader and resolves when the Effect succeeds', async () => {
    const { element, mounted } = mount();

    await clickScenario('Effect.succeed', element);

    await vi.waitFor(() => {
      expect(traceText(element)).toContain('RESUME');
    });
    expect(traceText(element)).toContain('YIELD');
    await vi.waitFor(() => {
      expect(element.textContent).toContain('Ada Lovelace');
    });

    mounted.destroy();
  });

  it('carries the Effect error _tag through to the exception channel', async () => {
    const { element, mounted } = mount();

    await clickScenario('Effect.fail — UserNotFound', element);

    await vi.waitFor(() => {
      expect(traceText(element)).toContain('SHORT-CIRCUIT');
    });
    expect(traceText(element)).toContain('Cause.Fail "UserNotFound"');

    // The template matched on the discriminant — proof the _tag survived the
    // whole trip from the Effect error to matchBlock.
    await vi.waitFor(() => {
      expect(element.textContent).toContain('arrived intact on');
    });
    expect(element.textContent).not.toContain('Ada Lovelace');

    mounted.destroy();
  });

  it('distinguishes two different Effect error tags', async () => {
    const { element, mounted } = mount();

    await clickScenario('Effect.fail — Unauthorized', element);

    await vi.waitFor(() => {
      expect(traceText(element)).toContain('Cause.Fail "Unauthorized"');
    });
    expect(traceText(element)).not.toContain('UserNotFound');

    mounted.destroy();
  });

  it('routes a defect away from the exception channel', async () => {
    const { element, mounted } = mount();

    await clickScenario('Effect.die — defect', element);

    await vi.waitFor(() => {
      expect(traceText(element)).toContain('DEFECT');
    });
    // A defect is not a business exception: no discriminant match is rendered.
    expect(element.textContent).not.toContain('arrived intact on');

    mounted.destroy();
  });
});
