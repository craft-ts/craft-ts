/* eslint-disable playwright/no-standalone-expect */
import { computed } from '@angular/core';
import { createFunctionRegistry } from './function-registry';

describe('function registry', () => {
  it('can register while a computed function is being evaluated', () => {
    const registry = createFunctionRegistry();
    const registration = computed(() =>
      registry.register('computed-action', [], () => undefined),
    );

    expect(() => registration()).not.toThrow();
    expect(registry.entries()).toHaveLength(1);
    expect(registry.logs()).toHaveLength(1);
  });

  it('publishes registrations and cleanup through its entries signal', () => {
    const registry = createFunctionRegistry();

    const cleanup = registry.register(
      'save',
      ['Editor', 'Document'],
      () => undefined,
    );

    expect(registry.entries()).toEqual([
      {
        key: 'save <= Editor > Document',
        hostName: 'save',
        ancestry: ['Editor', 'Document'],
      },
    ]);

    cleanup();
    expect(registry.entries()).toEqual([]);
  });

  it('invokes the current entry with the supplied arguments', () => {
    const registry = createFunctionRegistry();
    const functionRef = vi.fn(
      (left: unknown, right: unknown) => Number(left) + Number(right),
    );
    registry.register('sum', [], functionRef);

    expect(registry.invoke('sum', [2, 3])).toBe(5);
    expect(functionRef).toHaveBeenCalledWith(2, 3);
    expect(registry.logs().map(({ event }) => event)).toEqual([
      'registered',
      'call-started',
      'call-succeeded',
    ]);
  });

  it('does not let stale cleanup remove a replacement entry', () => {
    const registry = createFunctionRegistry();
    const staleCleanup = registry.register('save', [], () => 'old');
    registry.register('save', [], () => 'new');

    staleCleanup();

    expect(registry.invoke('save')).toBe('new');
  });

  it('reports a clear error when the entry is unavailable', () => {
    const registry = createFunctionRegistry();

    expect(() => registry.invoke('missing')).toThrow(
      'Registry entry "missing" is not available',
    );
    const logs = registry.logs();
    expect(logs[logs.length - 1]?.event).toBe('call-failed');
  });

  it('observes asynchronous invocation failures', async () => {
    const registry = createFunctionRegistry();
    registry.register('fail', [], async () => {
      throw new Error('boom');
    });

    await expect(registry.invoke('fail')).rejects.toThrow('boom');
    const logs = registry.logs();
    expect(logs[logs.length - 1]).toMatchObject({
      event: 'call-failed',
      key: 'fail',
      message: 'Call to fail failed: boom',
    });
  });
});
