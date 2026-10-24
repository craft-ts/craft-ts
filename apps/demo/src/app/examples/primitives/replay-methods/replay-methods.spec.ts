// @vitest-environment jsdom
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { beforeEach, describe, expect, it } from 'vitest';
import ReplayMethods from './replay-methods';

describe('ReplayMethods example', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('exercises selected methods, piped methods, and source emissions', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      ReplayMethods,
      element,
      CraftTestBed.inject(Injector),
    );
    CraftTestBed.tick();

    const click = (testId: string) => {
      const target = element.querySelector<HTMLButtonElement>(
        `[data-testid="${testId}"]`,
      );
      expect(target, `missing button ${testId}`).not.toBeNull();
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      CraftTestBed.tick();
    };

    click('record-cell-action-0');
    click('record-cell-action-1');
    expect(element.querySelector('[data-testid="cell-0"]')?.textContent).toContain(
      '1 action(s)',
    );
    expect(element.querySelector('[data-testid="cell-1"]')?.textContent).toContain(
      '1 action(s)',
    );

    click('pipe-add-one');
    click('pipe-add-through-previous');
    expect(element.querySelector('[data-testid="craft-pipe-case"]')?.textContent).toContain(
      'Compteur : 2',
    );

    click('source-emit');
    click('source-emit');
    expect(element.querySelector('[data-testid="source-case"]')?.textContent).toContain(
      'Événements reçus : 2',
    );

    mounted.destroy();
  });
});
