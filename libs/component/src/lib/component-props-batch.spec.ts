// @vitest-environment jsdom
import { craftExpose, craftService, state } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import { craftComponent } from './component';
import { button, div, p } from './hyperscript';
import type { Input } from './types';
import { renderCraftComponent } from './testing';

interface ChildInput {
  readonly a: Input<number>;
  readonly b: Input<number>;
  readonly c: Input<number>;
}

describe('a parent that gives a child new inputs', () => {
  it('draws the child once for all of them, never once per input', async () => {
    const { BatchCounter, provideBatchCounter } = craftService(
      { name: 'batchCounter', providedIn: 'toProvide' },
      function* () {
        const n = yield* state('n', 1, ({ update }) => ({
          bump: () => update((value) => value + 1),
        }));
        yield* craftExpose('bump', n.bump);
      },
    );

    const seen: string[] = [];
    const Child = craftComponent('BatchChild', {}, function* (props: ChildInput) {
      const a = yield* props.a();
      const b = yield* props.b();
      const c = yield* props.c();
      seen.push(`${a}-${b}-${c}`);
      return p(`${a}-${b}-${c}`);
    });

    const Parent = craftComponent(
      'BatchParent',
      { providers: [provideBatchCounter()] },
      function* () {
        const counter = yield* BatchCounter();
        // Read here, not inside the inputs: the parent is drawn again on a change, and
        // hands the child three new readers.
        const n = yield* counter.n();
        return div([
          button({ type: 'button', click: () => counter.bump() }, 'bump'),
          Child({
            a: function* () {
              return n;
            },
            b: function* () {
              return n;
            },
            c: function* () {
              return n;
            },
          }),
        ]);
      },
    );

    const rendered = await renderCraftComponent(Parent as never);
    expect(seen).toEqual(['1-1-1']);

    (rendered.element.querySelector('button') as HTMLButtonElement).click();
    await rendered.flush();

    // One drawing for the change: never `2-1-1` or `2-2-1`, the child seen between two
    // of the writes, and never the same state drawn three times.
    expect(seen).toEqual(['1-1-1', '2-2-2']);
    expect(rendered.element.querySelector('p')?.textContent).toBe('2-2-2');
    rendered.destroy();
  });
});
