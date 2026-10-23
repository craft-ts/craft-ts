// @vitest-environment jsdom
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import {
  LocalStoragePersister,
  provideLocalStoragePersister,
  provideStoragePersister,
} from '@craft-ts/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PixelArt from './pixel-art';

describe('PixelArt', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    if (typeof localStorage.clear !== 'function') {
      const values = new Map<string, string>();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
          clear: () => values.clear(),
          key: (index: number) => Array.from(values.keys())[index] ?? null,
          get length() {
            return values.size;
          },
        } satisfies Storage,
      });
    }
    localStorage.clear();
    CraftTestBed.configureTestingModule({
      providers: [
        provideLocalStoragePersister(),
        provideStoragePersister(function* () {
          return yield* LocalStoragePersister();
        }),
      ],
    });
  });

  it('paints a cell background when the cell is clicked', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      PixelArt,
      element,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();

    await vi.waitFor(() =>
      expect(element.querySelector('[data-testid="pixel-cell"]')).toBeTruthy(),
    );
    CraftTestBed.tick();

    const cell = element.querySelector<HTMLButtonElement>(
      '[data-testid="pixel-cell"]',
    );
    expect(cell).toBeTruthy();
    expect(cell?.style.getPropertyValue('--pixel-fill')).toBe('#f8fafc');

    cell?.click();
    CraftTestBed.tick();

    expect(cell?.style.getPropertyValue('--pixel-fill')).toBe('#0f172a');

    mounted.destroy();
  });
});
