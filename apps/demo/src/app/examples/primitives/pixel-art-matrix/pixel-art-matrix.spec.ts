// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ng/core';
import { mountCraftComponent } from '@craft-ng/component';
import {
  provideCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
} from '@craft-ng/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LONG_PRESS_DURATION_MS } from './long-press.directive';
import PixelArtMatrix from './pixel-art-matrix';

const EMPTY = 'rgb(248, 250, 252)';
const PAINTED = 'rgb(15, 23, 42)';

const cellsInColumn = (root: HTMLElement, columnIndex: number) =>
  Array.from(root.querySelectorAll('.matrix-row')).map(
    (row) => row.querySelectorAll<HTMLButtonElement>('.matrix-cell')[columnIndex],
  );

describe('PixelArtMatrix', () => {
  let clock: VirtualCraftTemporalRuntime;

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    clock = new VirtualCraftTemporalRuntime();
    TestBed.configureTestingModule({
      providers: [provideCraftTemporalRuntime(clock)],
    });
  });

  it('paints a cell background when the cell is clicked', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      PixelArtMatrix,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const cell = element.querySelector<HTMLButtonElement>('.matrix-cell');
    expect(cell).toBeTruthy();
    expect(cell?.style.backgroundColor).toBe(EMPTY);

    cell?.click();
    TestBed.tick();

    expect(cell?.style.backgroundColor).toBe(PAINTED);

    mounted.destroy();
  });

  it('paints the full column on long press with the target cell color', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      PixelArtMatrix,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const origin = cellsInColumn(element, 0)[0];
    expect(origin).toBeTruthy();
    origin?.click();
    TestBed.tick();
    expect(origin?.style.backgroundColor).toBe(PAINTED);

    origin?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await clock.advanceBy(LONG_PRESS_DURATION_MS);
    TestBed.tick();

    const column = cellsInColumn(element, 0);
    expect(column.length).toBe(16);
    expect(
      column.map((cell) => cell?.style.backgroundColor),
    ).toEqual(Array.from({ length: 16 }, () => PAINTED));

    const neighbor = cellsInColumn(element, 1)[0];
    expect(neighbor?.style.backgroundColor).toBe(EMPTY);

    origin?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    origin?.click();
    TestBed.tick();
    expect(origin?.style.backgroundColor).toBe(PAINTED);

    mounted.destroy();
  });
});
