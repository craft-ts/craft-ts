// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { craftComputed, craftService, craftSignal } from '@craft-ts/core';
import { craftComponent } from './component';
import { withComponentProviders } from './composition';
import { p } from './hyperscript';
import { matchNode } from './match-node';
import { renderCraftComponent } from './testing';

it('re-renders a scalar service member in its component injector (#26)', async () => {
  const mode = craftSignal<'a' | 'b'>('a');
  const { View, provideView } = craftService(
    { name: 'View', providedIn: 'toProvide' },
    function* () {
      yield* craftComputed('mode', function* () {
        return mode();
      });
    },
  );
  const Root = craftComponent('Root', {}, () =>
    matchNode.exhaustive(View.mode, { a: () => p('A'), b: () => p('B') }),
  ).pipe(withComponentProviders(() => [provideView()]));
  const view = await renderCraftComponent(Root, { props: {} });
  try {
    expect(view.element.textContent).toBe('A');
    mode.set('b');
    await view.flush();
    expect(view.element.textContent).toBe('B');
  } finally {
    view.destroy();
  }
});
