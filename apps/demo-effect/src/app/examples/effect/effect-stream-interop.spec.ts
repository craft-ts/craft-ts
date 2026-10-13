// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import {
  TestBed,
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { craftTemporalClock } from '@craft-ts/stream-effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import EffectStreamInteropComponent from './effect-stream-interop';

// Effect's Clock follows the craft temporal runtime here (the route provides
// `craftTemporalClock()`), so the Effect sleeps are driven by the virtual clock:
// no real waiting.
describe('demo: Effect streams and craft streams', () => {
  let disposeBridge: () => void;
  let restoreClock: () => void;
  let clock: VirtualCraftTemporalRuntime;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
    clock = new VirtualCraftTemporalRuntime();
    restoreClock = activateCraftTemporalRuntime(clock);
    element = document.createElement('div');
    document.body.append(element);
  });

  afterEach(() => {
    restoreClock();
    disposeBridge();
    TestBed.resetTestingModule();
  });

  const buttonLabelled = (label: string) => {
    const found = [...element.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === label,
    );
    if (!found) throw new Error(`No button labelled ${label}`);
    return found;
  };

  /** Advances virtual time, letting Effect's own scheduler resume its fibers. */
  const advance = async (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      await clock.advanceBy(100);
      for (let turn = 0; turn < 3; turn += 1) {
        // Effect's own scheduler, not a craft timer: it needs a real macrotask.
        // eslint-disable-next-line craft-ts/no-direct-temporal-globals
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      TestBed.tick();
    }
  };

  const mount = () => {
    const injector = TestBed.rootInjector.createChild([
      provideLayer(craftTemporalClock()),
    ]);
    const mounted = mountCraftComponent(
      EffectStreamInteropComponent,
      element,
      injector,
    );
    TestBed.tick();
    return () => {
      mounted.destroy();
      injector.destroy();
    };
  };

  it('reads an Effect Stream as a craft stream, value by value, then completes', async () => {
    const destroy = mount();

    buttonLabelled('Start').click();
    await advance(500);
    expect(element.textContent).toContain('Latest: ALPHA');
    expect(element.textContent).toContain('Status: running');

    await advance(1000);
    expect(element.textContent).toContain('Latest: GAMMA');
    expect(element.textContent).toContain('Status: completed');

    destroy();
  });

  it('collects a craft stream inside an Effect program', async () => {
    const destroy = mount();

    buttonLabelled('Collect 4 ticks').click();
    await advance(300);
    expect(element.textContent).toContain('Collecting…');

    await advance(1500);
    expect(element.textContent).toContain('Collected: 0, 1, 2, 3');

    destroy();
  });
});
