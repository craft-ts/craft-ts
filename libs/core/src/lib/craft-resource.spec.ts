import {
  computed,
  signal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { craftResource } from './craft-resource';
import { craftSignal } from './host/craft-signal';
import { setupCraftServiceTest } from './setup-craft-service-test';

describe('craftResource', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function createResource() {
    const params = signal({ id: 1 });
    return TestBed.runInInjectionContext(() =>
      craftResource({
        params: () => params(),
        loader: async ({ params: p }) => ({ id: p.id, name: `item-${p.id}` }),
      }),
    );
  }

  it('resolves the loader result on value/state', async () => {
    const resource = createResource();
    await vi_waitForResolved(resource);

    expect(resource.hasValue()).toBe(true);
    expect(resource.value()).toEqual({ id: 1, name: 'item-1' });
    expect(resource.state()).toEqual({ id: 1, name: 'item-1' });
    expect(resource.value()).toEqual({ id: 1, name: 'item-1' });
    expect(resource.status()).toBe('resolved');
    expect(resource.isLoading()).toBe(false);
  }, 30_000);

  it('value and state are undefined while there is no value yet', () => {
    const resource = createResource();
    expect(resource.hasValue()).toBe(false);
    expect(resource.value()).toBeUndefined();
    expect(resource.state()).toBeUndefined();
  });

  it('exposes paramSrc as the exact params function passed in', () => {
    const params = signal({ id: 7 });
    const resource = TestBed.runInInjectionContext(() =>
      craftResource({
        params: params,
        loader: async ({ params: p }) => p,
      }),
    );
    expect(resource.paramSrc).toBe(params as never);
  });

  it('exposes the raw error signal as an internal channel', async () => {
    const resource = TestBed.runInInjectionContext(() =>
      craftResource({
        params: () => ({ id: 1 }),
        loader: async () => {
          throw new Error('loader failed');
        },
      }),
    );
    await vi_waitForSettled(resource);
    const internalError = (
      resource as unknown as { error: () => unknown }
    ).error();
    expect(internalError).toBeInstanceOf(Error);
    expect(resource.hasValue()).toBe(false);
  }, 30_000);

  it('bound methods (reload, destroy, update, set, asReadonly) operate without a `this` receiver', async () => {
    const resource = createResource();
    await vi_waitForResolved(resource);

    const { set, update, reload, asReadonly, destroy } = resource;
    set({ id: 99, name: 'manual' });
    expect(resource.value()).toEqual({ id: 99, name: 'manual' });

    update((current) => ({
      ...(current as { id: number; name: string }),
      name: 'updated',
    }));
    expect(resource.value()).toEqual({ id: 99, name: 'updated' });

    expect(asReadonly()).toBeTruthy();
    expect(() => reload()).not.toThrow();
    expect(() => destroy()).not.toThrow();
  }, 30_000);

  it('cancels an in-flight load when a local value is set', async () => {
    let resolve!: (value: { id: number; name: string }) => void;
    const resource = TestBed.runInInjectionContext(() =>
      craftResource({
        params: () => ({ id: 1 }),
        loader: () =>
          new Promise<{ id: number; name: string }>((done) => {
            resolve = done;
          }),
      }),
    );

    expect(resource.status()).toBe('loading');
    resource.set({ id: 1, name: 'local' });
    resolve({ id: 1, name: 'server' });
    await Promise.resolve();

    expect(resource.status()).toBe('local');
    expect(resource.value()).toEqual({ id: 1, name: 'local' });
  });

  it('notifies Angular status consumers when destroyed', async () => {
    const resource = createResource();
    const status = computed(() => resource.status());
    await vi_waitForResolved(resource);
    expect(status()).toBe('resolved');

    resource.destroy();

    expect(status()).toBe('idle');
  });

  it('stops the linked Craft params watch when destroyed', async () => {
    const { injector } = setupCraftServiceTest();
    const params = craftSignal({ id: 1 });
    const sourceFn = vi.fn(() => params());
    const resource = injector.run(() =>
      craftResource({
        params: sourceFn,
        loader: async ({ params: p }) => ({ id: p.id, name: `item-${p.id}` }),
      }),
    );

    await vi_waitForResolved(resource);
    expect(resource.value()).toEqual({ id: 1, name: 'item-1' });

    sourceFn.mockClear();
    resource.destroy();

    params.set({ id: 2 });
    expect(sourceFn).not.toHaveBeenCalled();
  });
});

async function vi_waitForResolved(resource: {
  status: () => string;
}): Promise<void> {
  for (let i = 0; i < 50 && resource.status() !== 'resolved'; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function vi_waitForSettled(resource: {
  status: () => string;
}): Promise<void> {
  for (
    let i = 0;
    i < 50 && !['resolved', 'error'].includes(resource.status());
    i++
  ) {
    await new Promise((r) => setTimeout(r, 0));
  }
}
