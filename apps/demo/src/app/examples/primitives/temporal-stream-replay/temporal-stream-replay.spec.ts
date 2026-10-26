// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import {
  CraftTestBed,
  ɵInjector as Injector,
  provideCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
} from '@craft-ts/core';
import { beforeEach, describe, expect, it } from 'vitest';
import TemporalStreamReplay from './temporal-stream-replay';

describe('TemporalStreamReplay', () => {
  let clock: VirtualCraftTemporalRuntime;

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    clock = new VirtualCraftTemporalRuntime(10_000);
    CraftTestBed.configureTestingModule({
      providers: [provideCraftTemporalRuntime(clock)],
    });
  });

  it('replays independent user heartbeats and their distinct timeouts', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      TemporalStreamReplay,
      element,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();

    const click = (id: string) => {
      element
        .querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      CraftTestBed.tick();
    };
    const status = (id: string) =>
      element.querySelector(`[data-testid="${id}-status"]`)?.textContent;
    const value = (id: string) =>
      element.querySelector(`[data-testid="${id}-value"]`)?.textContent;

    await clock.advanceBy(500);
    click('alice-heartbeat');
    click('bob-heartbeat');
    await clock.advanceBy(300);
    CraftTestBed.tick();

    expect(status('alice')).toBe('running');
    expect(value('alice')).toBe('heartbeat');
    expect(status('bob')).toBe('running');
    expect(value('bob')).toBe('heartbeat');
    expect(status('chloe')).toBe('running');
    expect(value('chloe')).toBe('—');

    await clock.advanceBy(500);
    CraftTestBed.tick();
    expect(status('alice')).toBe('running');
    expect(status('bob')).toBe('running');
    expect(value('bob')).toBe('heartbeat');

    await clock.advanceBy(700);
    CraftTestBed.tick();
    expect(status('alice')).toBe('completed');
    expect(value('alice')).toBe('timeout (1200 ms)');
    expect(status('bob')).toBe('completed');
    expect(value('bob')).toBe('timeout (1500 ms)');
    expect(status('chloe')).toBe('completed');
    expect(value('chloe')).toBe('timeout (2000 ms)');

    mounted.destroy();
  });
});
