import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  craftNodeDirective,
  DestroyRef,
  ɵinject as inject,
} from '@craft-ts/core';
import { craftComponent, div, span } from '../index';
import { renderCraftComponent } from './testing';

afterEach(() => document.body.replaceChildren());

describe('component destruction failures', () => {
  it('releases directive scopes, sibling views and the host after a directive cleanup throws', async () => {
    const failure = new Error('directive cleanup');
    const released = vi.fn();
    const returned = vi.fn();
    const failing = craftNodeDirective('failingCleanup', [], () => {
      inject(DestroyRef).onDestroy(released);
      return () => {
        returned();
        throw failure;
      };
    });
    const sibling = craftNodeDirective('siblingCleanup', [], () => {
      inject(DestroyRef).onDestroy(released);
      return released;
    });
    const view = craftComponent('CleanupView', {}, () =>
      div([span('first').pipe(failing), span('second').pipe(sibling)]),
    );
    const fixture = await renderCraftComponent(view);
    const { destroy } = fixture;
    expect(() => destroy()).toThrow(failure);
    expect(released).toHaveBeenCalledTimes(3);
    expect(fixture.element.isConnected).toBe(false);
    expect(() => destroy()).not.toThrow();
    expect(returned).toHaveBeenCalledOnce();
  });
});
