// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { craftComponent, div } from '@craft-ts/component';
import { provideCraftProduction } from '@craft-ts/core';
import { ɵwithCompiledTemplate } from '@craft-ts/component/compiler-runtime';
import {
  createEnvironmentInjector,
  Injector,
  type EnvironmentInjector,
  ɵEffectScheduler,
} from '../../component/src/lib/host-runtime';
import { mountInterpretedComponent } from '../../component/src/lib/render/interpreter';
import { CRAFT_COMPONENT } from '../../component/src/lib/types';

it('activates after a generic mount and keeps template invalidation fallback', () => {
  const Child = craftComponent('ActivationLateChild', {}, () => div('late'));
  const injector = createEnvironmentInjector(
    [provideCraftProduction()],
    Injector.NULL as EnvironmentInjector,
    'activation',
  );
  let serial = 0;
  const mounted: ReturnType<typeof mountInterpretedComponent>[] = [];
  const mount = () => {
    const App = craftComponent('ActivationLateRoot' + serial++, {}, () =>
      Child({}),
    );
    const host = document.createElement('div');
    const view = mountInterpretedComponent(App as never, host, injector, {});
    mounted.push(view);
    injector.get(ɵEffectScheduler).flush();
    return host;
  };
  const create = vi.fn((renderer: any) => {
    const root = renderer.createElement('div'),
      text = renderer.createText('late');
    renderer.insertBefore(root, text, null);
    return [root, text];
  });
  try {
    expect(mount().textContent).toBe('late');
    expect(create).not.toHaveBeenCalled();
    ɵwithCompiledTemplate(Child, {
      version: 1,
      create,
      bind: () => [],
      elements: [{ slot: 0, path: [] }],
      bindings: [],
    });
    expect(mount().textContent).toBe('late');
    expect(create).toHaveBeenCalledOnce();
    const definition = (Child as any)[CRAFT_COMPONENT];
    definition.template = () => div('replaced');
    expect(mount().textContent).toBe('replaced');
    expect(create).toHaveBeenCalledOnce();
  } finally {
    for (const view of mounted.reverse()) view.destroy();
    injector.destroy();
  }
});
