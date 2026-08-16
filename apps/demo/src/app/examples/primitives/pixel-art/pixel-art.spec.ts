// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ng/core';
import { mountCraftComponent } from '@craft-ng/component';
import {
  LocalStoragePersister,
  provideLocalStoragePersister,
  provideStoragePersister,
} from '@craft-ng/core';
import { beforeEach, describe, expect, it } from 'vitest';
import PixelArt from './pixel-art';

describe('PixelArt', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideLocalStoragePersister(),
        provideStoragePersister(function* () {
          return yield* LocalStoragePersister();
        }),
      ],
    });
  });

  it('paints a cell background when the cell is clicked', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      PixelArt,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const cell = element.querySelector<HTMLButtonElement>('.pixel-cell');
    expect(cell).toBeTruthy();
    expect(cell?.style.backgroundColor).toBe('rgb(248, 250, 252)');

    cell?.click();
    TestBed.tick();

    expect(cell?.style.backgroundColor).toBe('rgb(15, 23, 42)');

    mounted.destroy();
  });
});
