import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import {
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
  provideCorrelationIdTracking,
} from '@craft-ts/core';
import StreamDemo from './stream-demo';
import { provideDemoStreamTrace, traceLines } from './trace-log';

let clock: VirtualCraftTemporalRuntime;
let restoreClock: () => void;

beforeEach(() => {
  clock = new VirtualCraftTemporalRuntime();
  restoreClock = activateCraftTemporalRuntime(clock);
  traceLines.set([]);
});

afterEach(() => {
  restoreClock();
});

async function render() {
  return renderCraftComponent(StreamDemo, {
    providers: [
      provideCorrelationIdTracking(),
      provideDemoStreamTrace(),
    ] as never,
  });
}

function section(element: HTMLElement, title: string): string {
  return (
    [...element.querySelectorAll('section')].find(
      (candidate) =>
        candidate.querySelector('h1,h2,h3,h4')?.textContent === title,
    )?.textContent ?? ''
  );
}

describe('the typed streams demo', () => {
  it('debounces a search and resolves the SearchApi service in the handler', async () => {
    const rendered = await render();
    const field = rendered.element.querySelector('input') as HTMLInputElement;

    field.value = 'dune';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await clock.advanceBy(300);
    await clock.advanceBy(400);
    await rendered.flush();

    expect(section(rendered.element, 'Live search')).toContain('Dune Messiah');
    expect(traceLines().join('\n')).toContain('· answered: next');
    rendered.destroy();
  });

  it('shows a typed exception from the search API, not a crash', async () => {
    const rendered = await render();
    const field = rendered.element.querySelector('input') as HTMLInputElement;

    field.value = 'boom';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await clock.advanceBy(300);
    await clock.advanceBy(400);
    await rendered.flush();

    expect(section(rendered.element, 'Live search')).toContain(
      'SearchUnavailable',
    );
    rendered.destroy();
  });

  it('links a ticker started by a click to that click in the trace', async () => {
    const rendered = await render();
    const start = [...rendered.element.querySelectorAll('button')].find(
      (button) => button.textContent === 'Start',
    ) as HTMLButtonElement;

    start.click();
    await clock.advanceBy(3000);
    await rendered.flush();

    expect(traceLines().some((line) => /^ticker \[.*:click:/.test(line))).toBe(
      true,
    );
    expect(section(rendered.element, 'Ticker')).toContain('Tick: 3');
    rendered.destroy();
  });

  it('reports a defect as a defect', async () => {
    const rendered = await render();
    const raise = [...rendered.element.querySelectorAll('button')].find(
      (button) => button.textContent === 'Raise a defect',
    ) as HTMLButtonElement;

    raise.click();
    await rendered.flush();

    expect(section(rendered.element, 'Defect')).toContain('demo defect');
    expect(traceLines().some((line) => line.includes(' defect Error'))).toBe(
      true,
    );
    rendered.destroy();
  });
});
