import {
  InjectionToken,
  signal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { craftService, ɵtoCraftService as toCraftService, type CraftServiceInput } from './craft-service';
import { craftUse } from './craft-use';
import {
  provideReactiveReadObserver,
  type ReactiveReadEdge,
} from './reactive-read';
import { state } from './state';

describe('craft service inputs', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('tracks a craft reader consumed through a service input', () => {
    const edges: ReactiveReadEdge[] = [];
    TestBed.configureTestingModule({
      providers: [provideReactiveReadObserver((edge) => edges.push(edge))],
    });

    const { ReadInput } = craftService(
      { name: 'ReadInput', scope: 'function' },
      function* (inputs: { value: CraftServiceInput<number> }) {
        return yield* inputs.value();
      },
    );

    TestBed.runInInjectionContext(() => {
      const source = craftUse(state('service-input-source', 3));
      expect(craftUse(ReadInput({ value: source }))).toBe(3);
    });

    expect(
      edges.some(
        ({ reader, dependency }) =>
          reader?.name === 'ReadInput' &&
          dependency.name === 'service-input-source',
      ),
    ).toBe(true);
  });

  it('tracks an Angular signal passed as a service input', () => {
    const edges: ReactiveReadEdge[] = [];
    TestBed.configureTestingModule({
      providers: [provideReactiveReadObserver((edge) => edges.push(edge))],
    });

    const { ReadSignalInput } = craftService(
      { name: 'ReadSignalInput', scope: 'function' },
      function* (inputs: { value: CraftServiceInput<number> }) {
        return yield* inputs.value();
      },
    );
    const source = signal(5);

    TestBed.runInInjectionContext(() => {
      expect(craftUse(ReadSignalInput({ value: source }))).toBe(5);
    });

    expect(
      edges.some(
        ({ reader, dependency }) =>
          reader?.name === 'ReadSignalInput' &&
          dependency.name === 'ReadSignalInput.value',
      ),
    ).toBe(true);
  });

  it('tracks signals exposed by a provider-backed service', () => {
    type ProviderValue = { readonly value: ReturnType<typeof signal<number>> };
    const token = new InjectionToken<ProviderValue>('TrackedProviderValue');
    const edges: ReactiveReadEdge[] = [];

    const { ReadProvider, provideReadProvider } = toCraftService(
      {
        name: 'ReadProvider',
        scope: 'toProvide',
        token,
        provide: () => [],
      },
      function* (provider) {
        return yield* provider.value();
      },
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: token, useValue: { value: signal(7) } },
        provideReactiveReadObserver((edge) => edges.push(edge)),
        provideReadProvider(),
      ],
    });

    TestBed.runInInjectionContext(() => {
      expect(craftUse(ReadProvider())).toBe(7);
    });

    expect(
      edges.some(
        ({ reader, dependency }) =>
          reader?.name === 'ReadProvider' &&
          dependency.name === 'ReadProvider.value',
      ),
    ).toBe(true);
  });
});
