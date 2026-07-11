/* eslint-disable playwright/no-standalone-expect */
import { computed } from '@angular/core';
import type {
  PrimitiveMethodRuntimeContext,
  PrimitiveMethodRuntimeKind,
  PrimitiveResourceRuntimeContext,
  StateMethodRuntimeContext,
} from '@craft-ng/core';
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
        capabilities: [],
        overrideActive: false,
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

  it('replaces a state method at runtime and restores the original behavior', () => {
    const registry = createFunctionRegistry();
    const state = createStateContext(0);
    const original = vi.fn(() =>
      state.update((current) => Number(current) + 1),
    );
    registry.register('method:increment', ['state'], original, state);

    const details = registry.override(
      'method:increment <= state',
      '({ state }) => state.update(current => current + 10)',
    );
    const execution = registry.executeOverride(
      'method:increment <= state',
      [],
      state,
    );

    expect(execution.matched).toBe(true);
    expect(state.get()).toBe(10);
    expect(original).not.toHaveBeenCalled();
    expect(details).toMatchObject({
      capabilities: ['state.get', 'state.set', 'state.update', 'state.patch'],
      overrideActive: true,
      originalSource: '() => update(current => current + 1)',
      override: {
        source: '({ state }) => state.update(current => current + 10)',
      },
    });

    registry.restore('method:increment <= state');
    original();
    expect(state.get()).toBe(11);
    expect(registry.get('method:increment <= state')?.overrideActive).toBe(
      false,
    );
  });

  it.each(['query', 'asyncProcess', 'mutation', 'queryParam'] as const)(
    'exposes and executes %s runtime capabilities',
    (kind) => {
      const registry = createFunctionRegistry();
      const context = createPrimitiveContext(kind, { count: 0 });
      registry.register('method:replace', [kind], () => undefined, context);

      const key = `method:replace <= ${kind}`;
      registry.override(
        key,
        `({ ${kind} }) => ${kind}.patch(() => ({ count: 10 }))`,
      );
      registry.executeOverride(key, [], context);

      expect(context.get()).toEqual({ count: 10 });
      expect(registry.get(key)?.capabilities).toEqual([
        `${kind}.get`,
        `${kind}.set`,
        `${kind}.update`,
        `${kind}.patch`,
      ]);
    },
  );

  it('exposes and mutates primitive value capabilities directly', () => {
    const registry = createFunctionRegistry();
    const resource = createResourceContext('queryParam', { count: 0 });
    registry.registerResource('queryParam', ['component:List#1'], resource);

    const key = 'queryParam <= component:List#1';

    expect(registry.get(key)).toMatchObject({
      capabilities: [
        'queryParam.get',
        'queryParam.set',
        'queryParam.update',
        'queryParam.patch',
      ],
      primitive: {
        kind: 'queryParam',
        grouped: false,
        ids: [],
      },
    });

    expect(registry.resourceSet(key, { count: 1 })).toEqual({ count: 1 });
    expect(
      registry.resourceUpdate(
        key,
        '(current) => ({ count: current.count + 10 })',
      ),
    ).toEqual({ count: 11 });
    expect(registry.resourcePatch(key, '() => ({ extra: true })')).toEqual({
      count: 11,
      extra: true,
    });

    expect(registry.resourceGet(key)).toEqual({ count: 11, extra: true });
    expect(registry.logs().map(({ event }) => event)).toEqual([
      'registered',
      'primitive-mutated',
      'primitive-mutated',
      'primitive-mutated',
      'primitive-read',
    ]);
  });

  it('targets grouped primitive instances by id', () => {
    const registry = createFunctionRegistry();
    const resource = createGroupedResourceContext('query');
    registry.registerResource('query', ['component:List#1'], resource);

    const key = 'query <= component:List#1';
    expect(registry.resourceSet(key, { name: 'first' }, 'page-1')).toEqual({
      name: 'first',
    });
    expect(
      registry.resourceUpdate(
        key,
        '(current) => ({ ...current, name: "updated" })',
        'page-1',
      ),
    ).toEqual({ name: 'updated' });

    expect(registry.resourceGet(key, 'page-1')).toEqual({ name: 'updated' });
    expect(registry.get(key)).toMatchObject({
      capabilities: [
        'query.get',
        'query.set',
        'query.update',
        'query.patch',
        'query.ids',
        'query.select',
      ],
      primitive: {
        kind: 'query',
        grouped: true,
        ids: ['page-1'],
      },
    });
  });

  it('rejects direct resource mutation on non-resource entries', () => {
    const registry = createFunctionRegistry();
    registry.register('plain', [], () => undefined);

    expect(() => registry.resourceSet('plain', 1)).toThrow(
      'does not expose primitive value capabilities',
    );
  });

  it('rejects invalid, unavailable and non-primitive overrides', () => {
    const registry = createFunctionRegistry();
    registry.register('plain', [], () => undefined);
    registry.register(
      'state-method',
      [],
      () => undefined,
      createStateContext(0),
    );

    expect(() => registry.override('missing', '() => undefined')).toThrow(
      'Registry entry "missing" is not available',
    );
    expect(() => registry.override('plain', '() => undefined')).toThrow(
      'does not expose primitive runtime capabilities',
    );
    expect(() => registry.override('state-method', '({')).toThrow(
      'Invalid override source',
    );
    expect(registry.get('state-method')?.overrideActive).toBe(false);
  });

  it('does not fall back to the original method when an override fails', () => {
    const registry = createFunctionRegistry();
    const state = createStateContext(0);
    const original = vi.fn();
    registry.register('method', [], original, state);
    registry.override('method', '() => { throw new Error("override boom") }');

    expect(() => registry.executeOverride('method', [], state)).toThrow(
      'override boom',
    );
    expect(original).not.toHaveBeenCalled();
    expect(registry.logs()[registry.logs().length - 1]).toMatchObject({
      event: 'override-failed',
      key: 'method',
    });
  });
});

function createStateContext(initialValue: unknown): StateMethodRuntimeContext {
  return createPrimitiveContext('state', initialValue);
}

function createPrimitiveContext<Kind extends PrimitiveMethodRuntimeKind>(
  kind: Kind,
  initialValue: unknown,
): PrimitiveMethodRuntimeContext<Kind> {
  let value = initialValue;
  return {
    kind,
    get: () => value,
    set: (next) => (value = next),
    update: (updater) => (value = updater(value)),
    patch: (updater) => (value = { ...(value as object), ...updater(value) }),
    originalSource: '() => update(current => current + 1)',
  };
}

function createResourceContext(
  kind: 'query' | 'asyncProcess' | 'mutation' | 'queryParam',
  initialValue: unknown,
): PrimitiveResourceRuntimeContext {
  let value = initialValue;
  return {
    kind,
    grouped: false,
    ids: () => [],
    get: () => value,
    set: (next) => (value = next),
    update: (updater) => (value = updater(value)),
    patch: (updater) => (value = { ...(value as object), ...updater(value) }),
  };
}

function createGroupedResourceContext(
  kind: 'query' | 'asyncProcess' | 'mutation' | 'queryParam',
): PrimitiveResourceRuntimeContext {
  const values = new Map<string, unknown>();
  const requireValue = (id: string | undefined): unknown => {
    if (id === undefined) {
      return Object.fromEntries(values);
    }
    if (!values.has(id)) {
      throw new Error(`Missing id ${id}`);
    }
    return values.get(id);
  };
  return {
    kind,
    grouped: true,
    ids: () => [...values.keys()],
    get: (id) => requireValue(id),
    set: (next, id) => {
      if (id === undefined) {
        values.clear();
        for (const [key, value] of Object.entries(next as object)) {
          values.set(key, value);
        }
        return next;
      }
      values.set(id, next);
      return next;
    },
    update: (updater, id) => {
      const next = updater(requireValue(id));
      if (id === undefined) {
        values.clear();
        for (const [key, value] of Object.entries(next as object)) {
          values.set(key, value);
        }
        return next;
      }
      values.set(id, next);
      return next;
    },
    patch: (updater, id) => {
      const current = requireValue(id);
      const next = { ...(current as object), ...updater(current) };
      if (id === undefined) {
        values.clear();
        for (const [key, value] of Object.entries(next)) {
          values.set(key, value);
        }
        return next;
      }
      values.set(id, next);
      return next;
    },
  };
}
