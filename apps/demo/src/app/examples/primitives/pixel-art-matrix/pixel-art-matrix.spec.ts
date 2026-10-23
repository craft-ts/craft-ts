// @vitest-environment jsdom
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import {
  provideCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
} from '@craft-ts/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LONG_PRESS_DURATION_MS } from '@craft-ts/core';
import PixelArtMatrix from './pixel-art-matrix';

const EMPTY = '#f8fafc';
const PAINTED = '#0f172a';

const cellsInColumn = (root: HTMLElement, columnIndex: number) =>
  Array.from(root.querySelectorAll('[data-testid="matrix-row"]')).map(
    (row) => row.querySelectorAll<HTMLButtonElement>('[data-testid="matrix-cell"]')[columnIndex],
  );
const cellsInRow = (root: HTMLElement, rowIndex: number) =>
  root.querySelectorAll<HTMLButtonElement>('[data-testid="matrix-row"]')[rowIndex]
    ?.querySelectorAll<HTMLButtonElement>('[data-testid="matrix-cell"]');

describe('PixelArtMatrix', () => {
  let clock: VirtualCraftTemporalRuntime;

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    clock = new VirtualCraftTemporalRuntime();
    CraftTestBed.configureTestingModule({
      providers: [provideCraftTemporalRuntime(clock)],
    });
  });

  it('mounts without an explicitly provided temporal runtime', () => {
    CraftTestBed.resetTestingModule();
    CraftTestBed.configureTestingModule({});
    const element = document.createElement('div');
    document.body.append(element);

    const mounted = mountCraftComponent(
      PixelArtMatrix,
      element,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();

    expect(element.querySelector('[data-testid="matrix-cell"]')).toBeTruthy();

    mounted.destroy();
  });

  it('paints a cell background when the cell is clicked', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      PixelArtMatrix,
      element,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();

    const cell = element.querySelector<HTMLButtonElement>('[data-testid="matrix-cell"]');
    expect(cell).toBeTruthy();
    expect(cell?.style.getPropertyValue('--pixel-fill')).toBe(EMPTY);

    cell?.click();
    CraftTestBed.tick();

    expect(cell?.style.getPropertyValue('--pixel-fill')).toBe(PAINTED);

    mounted.destroy();
  });

  it('copies a painted cell color across its row on right-click', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      PixelArtMatrix,
      element,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();

    const origin = cellsInRow(element, 0)?.[0];
    expect(origin).toBeTruthy();

    origin?.click();
    CraftTestBed.tick();
    expect(origin?.style.getPropertyValue('--pixel-fill')).toBe(PAINTED);

    const contextMenu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    expect(origin?.dispatchEvent(contextMenu)).toBe(false);
    CraftTestBed.tick();

    expect(
      Array.from(cellsInRow(element, 0) ?? []).map((cell) =>
        cell.style.getPropertyValue('--pixel-fill'),
      ),
    ).toEqual(Array.from({ length: 16 }, () => PAINTED));

    mounted.destroy();
  });

  it('paints the full column on long press with the target cell color', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      PixelArtMatrix,
      element,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();

    const origin = cellsInColumn(element, 0)[0];
    expect(origin).toBeTruthy();
    origin?.click();
    CraftTestBed.tick();
    expect(origin?.style.getPropertyValue('--pixel-fill')).toBe(PAINTED);

    origin?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await clock.advanceBy(LONG_PRESS_DURATION_MS);
    CraftTestBed.tick();

    const column = cellsInColumn(element, 0);
    expect(column.length).toBe(16);
    expect(
      column.map((cell) => cell?.style.getPropertyValue('--pixel-fill')),
    ).toEqual(Array.from({ length: 16 }, () => PAINTED));

    const neighbor = cellsInColumn(element, 1)[0];
    expect(neighbor?.style.getPropertyValue('--pixel-fill')).toBe(EMPTY);

    origin?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    origin?.click();
    CraftTestBed.tick();
    expect(origin?.style.getPropertyValue('--pixel-fill')).toBe(PAINTED);

    mounted.destroy();
  });
});
