import { describe, expect, it } from 'vitest';
import { craftService, overrideService, state } from '@craft-ts/core';
import { craftComponent } from './component';
import { craftDirective } from './directive';
import { button, div, p, section } from './hyperscript';
import { renderCraftComponent } from './testing';
import type { Input } from './types';

const { ServiceDrivenCounter, provideServiceDrivenCounter } = craftService(
  { name: 'serviceDrivenCounter', providedIn: 'toProvide' },
  function* () {
    const count = yield* state('count', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    return { count, increment: count.increment };
  },
);

const Counted = craftComponent(
  'Counted',
  { providers: [provideServiceDrivenCounter()] },
  function* () {
    const counter = yield* ServiceDrivenCounter();
    return section([
      p({ 'data-testid': 'value' }, counter.count),
      button('increment', { type: 'button', click: counter.increment }, '+'),
    ]);
  },
);

function valueOf(rendered: { element: HTMLElement }): string | undefined {
  return (
    rendered.element.querySelector('[data-testid="value"]')?.textContent ??
    undefined
  );
}

describe('a component driven by its own service', () => {
  it('keeps the service instance across rerenders', async () => {
    const rendered = await renderCraftComponent(Counted);

    const increment = rendered.element.querySelector(
      'button',
    ) as HTMLButtonElement;
    increment.click();
    await rendered.flush();
    increment.click();
    await rendered.flush();

    expect(valueOf(rendered)).toBe('2');
    rendered.destroy();
  });

  it('reads the component inputs from the template parameter', async () => {
    const Greeting = craftComponent(
      'Greeting',
      {},
      function* (inputs: { readonly name: Input<string> }) {
        return div({ 'data-testid': 'greeting' }, [
          'Hello ',
          `${yield* inputs.name()}`,
        ]);
      },
    );

    const rendered = await renderCraftComponent(Greeting, {
      props: { name: 'Ada' } as never,
    });

    expect(
      rendered.element.querySelector('[data-testid="greeting"]')?.textContent,
    ).toBe('Hello Ada');
    rendered.destroy();
  });

  it('lets a directive replace a service member for the component scope', async () => {
    const frozen = craftDirective(
      'frozen',
      {},
      {
        service: overrideService(ServiceDrivenCounter, (base) => ({
          ...base,
          increment: (() => undefined) as unknown as typeof base.increment,
        })),
      },
    );

    const FrozenCounted = Counted.pipe(frozen);
    const rendered = await renderCraftComponent(FrozenCounted as never);

    const increment = rendered.element.querySelector(
      'button',
    ) as HTMLButtonElement;
    increment.click();
    await rendered.flush();

    expect(valueOf(rendered)).toBe('0');
    rendered.destroy();
  });

  it('leaves the service untouched outside the directive', async () => {
    const rendered = await renderCraftComponent(Counted);
    const increment = rendered.element.querySelector(
      'button',
    ) as HTMLButtonElement;
    increment.click();
    await rendered.flush();

    expect(valueOf(rendered)).toBe('1');
    rendered.destroy();
  });
});
