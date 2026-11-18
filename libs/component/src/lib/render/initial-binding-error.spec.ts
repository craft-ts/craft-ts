// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  createBrowserDomAdapter,
  provideCraftProduction,
} from '@craft-ts/core';
import {
  createEnvironmentInjector,
  Injector,
  type EnvironmentInjector,
  signal,
} from '../host-runtime';
import { craftComponent } from '../component';
import { div } from '../hyperscript';
import { mountInterpretedComponentWithOptions } from './interpreter';
it.each(['attribute', 'style'])(
  'stops a %s binding whose first run throws',
  (kind) => {
    const value = signal(1),
      failure = new Error('initial binding failed'),
      read = vi.fn(() => {
        value();
        throw failure;
      });
    const App = craftComponent('InitialBindingFailure' + kind, {}, () =>
      div(
        kind === 'style'
          ? { style: () => ({ width: read() }) }
          : { title: () => read() },
        'row',
      ),
    );
    const injector = createEnvironmentInjector(
      [provideCraftProduction()],
      Injector.NULL as EnvironmentInjector,
      'initial-binding',
    );
    try {
      let caught: unknown;
      try {
        mountInterpretedComponentWithOptions(
          App,
          document.createElement('div'),
          injector,
          {},
          { renderer: createBrowserDomAdapter(document) },
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(failure);
      expect(read).toHaveBeenCalledOnce();
      read.mockClear();
      expect(() => value.set(2)).not.toThrow();
      expect(read).not.toHaveBeenCalled();
    } finally {
      injector.destroy();
    }
  },
);
it('still propagates later binding failures and stops on destruction', () => {
  const value = signal(1),
    failure = new Error('later binding failed'),
    read = vi.fn(() => {
      const current = value();
      if (current === 2) throw failure;
      return String(current);
    });
  const App = craftComponent('SubsequentBindingFailure', {}, () =>
    div({ title: () => read() }, 'row'),
  );
  const injector = createEnvironmentInjector(
      [provideCraftProduction()],
      Injector.NULL as EnvironmentInjector,
      'later-binding',
    ),
    host = document.createElement('div');
  const view = mountInterpretedComponentWithOptions(
    App,
    host,
    injector,
    {},
    { renderer: createBrowserDomAdapter(document) },
  );
  try {
    expect(host.firstElementChild?.getAttribute('title')).toBe('1');
    expect(() => value.set(2)).toThrow(failure);
    view.destroy();
    read.mockClear();
    value.set(3);
    expect(read).not.toHaveBeenCalled();
  } finally {
    view.destroy();
    injector.destroy();
  }
});
