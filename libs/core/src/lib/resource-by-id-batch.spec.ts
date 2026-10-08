import { signal } from './host/craft-compat';
import { craftWatch } from './host/craft-signal';
import { resourceById } from './resource-by-id';
import { setupCraftServiceTest } from './setup-craft-service-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// resourceById holds one resource per id and exposes the record of their values as
// `state`. Replacing the record touches several resources, and effects run
// synchronously: a reader of `state` was woken after each of them, on a record made of
// some ids already replaced and some not yet.
//
// The witness notes WHICH ids the record holds on every run. The value of an id that
// stays is not asserted: a resource mirrors its raw value through an effect of its own
// (preservedResource), so that value can arrive one effect after the record changed.
describe('resourceById replacing its records', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  const setup = () => {
    const { injector } = setupCraftServiceTest();
    return injector.run(() => {
      const params = signal<{ id: string } | undefined>(undefined);
      const resources = resourceById({
        identifier: (request) => request.id,
        params,
        loader: async ({ params }) => params.id,
      });
      resources.add({ id: '1' }, { defaultValue: 'one' });
      resources.add({ id: '2' }, { defaultValue: 'two' });
      const seen: string[] = [];
      const watch = craftWatch(() => {
        seen.push(Object.keys(resources.state()).join(','));
      });
      seen.length = 0;
      return { resources, seen, stop: () => watch.destroy() };
    });
  };

  it('replaces the whole record as one step', () => {
    const { resources, seen, stop } = setup();

    resources.set({ '2': 'TWO', '3': 'three' });

    // The ids the record holds change once: never `2` alone, nor `1,2,3`.
    expect(new Set(seen)).toEqual(new Set(['2,3']));
    stop();
  });

  it('merges an update as one step', () => {
    const { resources, seen, stop } = setup();

    resources.update((state) => ({ ...state, '1': 'ONE', '3': 'three' }));

    expect(new Set(seen)).toEqual(new Set(['1,2,3']));
    stop();
  });

  it('empties the record as one step', () => {
    const { resources, seen, stop } = setup();

    resources.reset();

    expect(seen).toEqual(['']);
    stop();
  });
});
