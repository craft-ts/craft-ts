import { signal } from './host/craft-compat';
import { CraftTestBed } from './host/craft-test-bed';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftService,
  type CraftServiceInput,
} from './craft-service';
import { craftUse } from './craft-use';
import { craftExpose } from './craft-primitive-gen';
import {
  provideReactiveReadObserver,
  type ReactiveReadEdge,
} from './reactive-read';
import { state } from './state';

describe('craft service inputs', () => {
  beforeEach(() => CraftTestBed.resetTestingModule());

  it('tracks a craft reader consumed through a service input', () => {
    const edges: ReactiveReadEdge[] = [];
    CraftTestBed.configureTestingModule({
      providers: [provideReactiveReadObserver((edge) => edges.push(edge))],
    });

    const { ReadInput } = craftService(
      { name: 'ReadInput', providedIn: 'function' },
      function* (inputs: { value: CraftServiceInput<number> }) {
        yield* craftExpose('value', yield* inputs.value());
      },
    );

    CraftTestBed.runInInjectionContext(() => {
      const source = craftUse(state('service-input-source', 3));
      expect(craftUse(ReadInput({ value: source })).value).toBe(3);
    });

    expect(
      edges.some(
        ({ reader, dependency }) =>
          reader?.name === 'ReadInput' &&
          dependency.name === 'service-input-source',
      ),
    ).toBe(true);
  });

  it('tracks a Craft signal passed as a service input', () => {
    const edges: ReactiveReadEdge[] = [];
    CraftTestBed.configureTestingModule({
      providers: [provideReactiveReadObserver((edge) => edges.push(edge))],
    });

    const { ReadSignalInput } = craftService(
      { name: 'ReadSignalInput', providedIn: 'function' },
      function* (inputs: { value: CraftServiceInput<number> }) {
        yield* craftExpose('value', yield* inputs.value());
      },
    );
    const source = signal(5);

    CraftTestBed.runInInjectionContext(() => {
      expect(craftUse(ReadSignalInput({ value: source })).value).toBe(5);
    });

    expect(
      edges.some(
        ({ reader, dependency }) =>
          reader?.name === 'ReadSignalInput' &&
          dependency.name === 'ReadSignalInput.value',
      ),
    ).toBe(true);
  });
});
