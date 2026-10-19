import { beforeEach, describe, expect, it } from 'vitest';
import { craftUse } from './craft-use';
import {
  CraftPrimitiveRegistry,
  ɵregisterCraftPrimitive,
} from './craft-primitive-registry';
import { craftService } from './craft-service';
import { craftSignal } from './host/craft-signal';
import { setupCraftServiceTest } from './setup-craft-service-test';
import { state } from './state';

const { Counter } = craftService(
  { name: 'Counter', providedIn: 'function' },
  function* () {
    yield* state('count', 0, ({ set }) => ({
      to: (value: number) => set(value),
    }));
  },
);

describe('craft primitive registry', () => {
  let injector: ReturnType<typeof setupCraftServiceTest>['injector'];
  let registry: CraftPrimitiveRegistry;

  beforeEach(() => {
    ({ injector } = setupCraftServiceTest());
    registry = injector.run(() => craftUse(CraftPrimitiveRegistry()));
  });

  it('addresses a primitive by its host chain and name', () => {
    injector.run(() => craftUse(Counter()));

    const entry = registry
      .list()
      .find((candidate) => candidate.name === 'count');

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('state');
    expect(entry?.address).toContain('state:count');
    // Every address carries its occurrence, like a component host tag does.
    expect(entry?.address).toMatch(/#\d+$/);
    expect(entry?.read()).toBe(0);
  });

  it('writes a value back through the address', () => {
    injector.run(() => craftUse(Counter()));

    const entry = registry.list().find((c) => c.name === 'count');
    entry?.write(7);

    expect(entry?.read()).toBe(7);
  });

  it('notifies observers when a registered state value changes', async () => {
    const store = injector.run(() => craftUse(Counter()));
    const changed: string[] = [];
    const disconnect = registry.onChange((address) => changed.push(address));

    craftUse(store.count.to(7));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('state:count');
    disconnect();
  });

  it('observes resolved resource results even when the value equals its default', async () => {
    const value = craftSignal<{ result: string } | undefined>(undefined);
    const status = craftSignal('loading');
    const changed: string[] = [];
    const disconnect = registry.onChange((address) => changed.push(address));
    injector.run(() =>
      ɵregisterCraftPrimitive({
        kind: 'query',
        name: 'search',
        read: () => value(),
        write: (next) => value.set(next as { result: string } | undefined),
        status: () => status(),
        injector,
      }),
    );

    status.set('resolved');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('query:search');
    disconnect();
  });

  it('restores a recorded resource failure without turning it into a success', () => {
    let current: unknown = undefined;
    let currentError: unknown;
    let currentStatus = 'loading';
    injector.run(() =>
      ɵregisterCraftPrimitive({
        kind: 'asyncProcess',
        name: 'load',
        read: () => current,
        write: (next) => {
          current = next;
          currentStatus = 'resolved';
        },
        restoreError: (error) => {
          current = undefined;
          currentError = error;
          currentStatus = 'error';
        },
        status: () => currentStatus,
        error: () => currentError,
        injector,
      }),
    );
    const entry = registry
      .list()
      .find((candidate) => candidate.name === 'load')!;

    registry.restore(
      { [entry.address]: undefined },
      { [entry.address]: { status: 'error', error: { message: 'recorded' } } },
    );

    expect(currentStatus).toBe('error');
    expect(currentError).toEqual({ message: 'recorded' });
  });

  it('captures and restores a snapshot', () => {
    const store = injector.run(() => craftUse(Counter()));

    const snapshot = registry.capture();
    craftUse(store.count.to(42));
    expect(craftUse(store.count())).toBe(42);

    registry.restore(snapshot);

    expect(craftUse(store.count())).toBe(0);
  });

  it('restores a replay snapshot when a unique primitive has a different instance ordinal', () => {
    injector.run(() => craftUse(Counter()));
    const entry = registry
      .list()
      .find((candidate) => candidate.name === 'count')!;
    const recordedAddress = entry.address.replace(/#\d+$/, '#99');

    registry.restore({ [recordedAddress]: 12 });

    expect(entry.read()).toBe(12);
  });

  it('primes a replay snapshot for a primitive created after its event', () => {
    let current = 0;
    registry.restore({ 'state:latePrimitive#4': 7 });

    const registerLatePrimitive = () =>
      ɵregisterCraftPrimitive({
        kind: 'state',
        name: 'latePrimitive',
        read: () => current,
        write: (next) => {
          current = next as number;
        },
        injector,
      });
    injector.run(registerLatePrimitive);

    expect(current).toBe(7);
    current = 0;
    injector.run(registerLatePrimitive);
    expect(current).toBe(7);
  });

  it('keeps two instances of the same host apart', () => {
    const { Row } = craftService(
      { name: 'Row', providedIn: 'function' },
      function* () {
        yield* state('value', 'a');
      },
    );

    injector.run(() => {
      craftUse(Row());
      craftUse(Row());
    });

    const entries = registry.list().filter((entry) => entry.name === 'value');

    // Both instances are registered, and neither overwrote the other.
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((entry) => entry.address)).size).toBe(2);

    // A service that can exist several times at once says WHICH one it is, so
    // the two are told apart by their host chain rather than only by the
    // registry's own tiebreaker — which is what snapshots and logs read.
    const hostChains = entries.map((entry) => entry.hostTags.join(' / '));
    expect(new Set(hostChains).size).toBe(2);
    for (const chain of hostChains) {
      expect(chain).toMatch(/service:Row#\d+/);
    }
  });

  it('leaves a singleton host unnumbered', () => {
    const { Settings } = craftService(
      { name: 'Settings', providedIn: 'global' },
      function* () {
        yield* state('theme', 'light');
      },
    );

    injector.run(() => craftUse(Settings()));

    const entry = registry
      .list()
      .find((candidate) => candidate.name === 'theme');

    // There is exactly one of it, so a number would be noise in every log line.
    expect(entry?.hostTags).toContain('service:Settings');
  });
});
