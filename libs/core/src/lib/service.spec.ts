import { TestBed } from '@angular/core/testing';
import { state } from './state';
import { InjectionToken, signal } from '@angular/core';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { Subject } from 'rxjs';
import { abstract, service, toValue } from './service';
import type { MaybeSignal } from './service';

// todoBefore analyser les testes pour les corriger si besoin
// todoBefore mettre des #error-check-docs:inputs dans les tests pour faire le lien avec la doc et éviter les confusions
// todo add contexte et dire qu'il doit absolument résoudre via inject d'anular
beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

describe('service', () => {
  it('should enable to create a service-like using service and inject it.', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to yield another service', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
      counter.incrementTwice();
      expect(counter()).toBe(3);
    });
  });

  // todo later eslint rule to block inject inside service
});
describe('scope', () => {
  it('should enable to create a global service by passing a name/scope', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should not expose provideCounter for service with global scope', () => {
    //@ts-expect-error provideCounter should not be defined for global service because it is provided automatically, it should not be possible to provide it manually
    const { injectCounter, provideCounter } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    expect(provideCounter).toBeUndefined();
  });

  // todo global service should not expose provideService

  it('should enable to create a global service by passing a name/scope', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to create a toProvide service by passing a name/scope', () => {
    const { injectCounter, provideCounter } = service(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to create a manuallyProvidedAtRoot service by passing a name/scope', () => {
    // for services that need to be provided at root but with some specific configuration (like inputs) that make it impossible to provide them with the provideService helper (or for external services like HttpClient)
    // the aim of this scope is to enable to inject it in global services while still exposing a public token for manual root providers
    const { injectCounter, provideCounter, CounterToProvide } = service(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    expect(CounterToProvide).toBeInstanceOf(InjectionToken);

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to manually provide a manuallyProvidedAtRoot service through CounterToProvide', () => {
    const { injectCounter, CounterToProvide } = service(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    const manualCounter = state(10, ({ update }) => ({
      increment: () => update((v) => v + 1),
    }));

    TestBed.configureTestingModule({
      providers: [{ provide: CounterToProvide, useValue: manualCounter }],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
    });
  });

  it('should enable to create a function service by passing a name/scope (mostly used for reusability and composition/inputs...)', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'function' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to create an abstract service by passing a name/scope', () => {
    interface Counter {
      (): number;
      increment(): void;
    }
    const counterService = service(
      { name: 'Counter', scope: 'abstract' },
      abstract<Counter>(), // todo create abstract helper that just return the type and do nothing else, to be used for abstract service
    );
    const { injectCounter } = counterService;

    expectTypeOf(injectCounter).toEqualTypeOf<() => Counter>();
    expect(injectCounter).toBeDefined();

    //@ts-expect-error provideCounter should not be defined because it's an abstract service, an implementation service should provide through requirement CounterRequirement
    const { provideCounter } = counterService;
    expect(provideCounter).toBeUndefined();
  });

  it('should enable to create a service from an abstract service through requirement (It should provide the implementation service and abstract service)', () => {
    const { injectCounter, CounterRequirement } = service(
      { name: 'Counter', scope: 'abstract' },
      abstract<{
        (): number;
        increment(): void;
      }>(), // todo create abstract helper that just return the type and do nothing else, to be used for abstract service
    );

    // todo CounterRequirement should only be exposed when scope: 'abstract' is set

    // todo when creating from requirement: CounterRequirement it should not be possible to create a global (to force to provide it ?) non
    const { injectCounterImpl, provideCounterImpl } = service(
      {
        name: 'CounterImpl',
        scope: 'toProvide',
        requirement: CounterRequirement,
      },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    // todo provideCounterImpl should provide CounterImpl and the source of CounterRequirement

    TestBed.configureTestingModule({
      providers: [provideCounterImpl()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);

      const counterImpl = injectCounterImpl();
      expect(counterImpl()).toBe(1);
    });
  });

  it('should not enable to create a global service from an abstract service', () => {
    const { CounterRequirement } = service(
      { name: 'Counter', scope: 'abstract' },
      abstract<{
        (): number;
        increment(): void;
      }>(),
    );

    //@ts-expect-error it should not be possible to create a global service from an abstract service, it should force to provide an implementation
    service(
      {
        name: 'CounterImpl',
        scope: 'global',
        requirement: CounterRequirement,
      },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );
  });

  it('should not enable to create a service implementation from an abstract service if the requirement is not satisfied', () => {
    const { CounterRequirement } = service(
      { name: 'Counter', scope: 'abstract' },
      abstract<{
        (): number;
        increment(): void;
      }>(),
    );

    //@ts-expect-error it should not be possible to create a service if the requirement is not satisfied,
    service(
      {
        name: 'CounterImpl',
        scope: 'global',
        requirement: CounterRequirement,
      },
      () => state(0),
    );
  });

  it('should not enable to create a global service that depends on a toProvide service', () => {
    const { injectCounter, provideCounter, CounterToYield } = service(
      { name: 'Counter', scope: 'toProvide' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    //@ts-expect-error it should not be possible to create a global service that depends on a toProvide service because the dependency cannot be resolved, it should force to provide the service in the test or use manuallyProvidedAtRoot for the service that need to be yield in a global service
    service({ name: 'GlobalCounter', scope: 'global' }, function* () {
      const counter = yield* CounterToYield();
      return counter;
    });
  });

  it('should enable to create a global service that depends on a manuallyProvidedAtRoot service', () => {
    const { provideCounter, CounterToYield } = service(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({ increment: () => update((v) => v + 1) })),
    );

    const { injectGlobalCounter } = service(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();
        return counter;
      },
    );

    TestBed.configureTestingModule({
      providers: [provideCounter()],
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectGlobalCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });
});

describe('injectService should enable to binding inputs', () => {
  it('should enable to bind a signal input', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })), // todo create toValue helper
    );

    TestBed.runInInjectionContext(() => {
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({ initialValue: 0 });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to bind an optional signal input and not bind an optional input', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
        optionalProperty1?: MaybeSignal<number>; // todo create MaybeSignal
        optionalProperty2?: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })), // todo create toValue helper
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter({ initialValue: 0, optionalProperty1: 0 });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to bind a signal input', () => {
    // todoBefore mettre inputs/method ? pour simpliéfier le binding ? et permet de rajouter un provide plus tard
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      const initialValue = signal(0);
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({ initialValue });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should return a string as an error "Inputs Error, xxx is not provided" if an input is not provided', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      expect(() => injectCounter()).toThrow(
        'Inputs Error, initialValue is not provided',
      );
    });
  });
  it('should provide a string token to say that the input is already provided', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      const initialValue = signal(0);
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({ initialValue });
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });

    TestBed.runInInjectionContext(() => {
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter({
        initialValue: 'Provided elsewhere #warn-check-docs:inputs',
      });
      expect(counter()).toBe(1);
      counter.increment();
      expect(counter()).toBe(2);
    });
  });

  // todo cas où on yield 2 fois un service fonction (ça devrait faire 2 instances différentes, mais avec les mêmes inputs)
});

// todoBefore generatrice aussi
describe('serviceToYield should enable to binding inputs', () => {
  it('should enable to bind a raw input', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({ initialValue: 10 });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should enable to bind a signal input', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({ initialValue: signal(10) });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should enable to bind an optional input and not bind an optional input', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>;
        optionalProperty1?: MaybeSignal<number>; // todo create MaybeSignal
        optionalProperty2?: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({
          initialValue: signal(10),
          optionalProperty1: signal(20),
        });

        return Object.assign(counter, {
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should return a string as an error "Inputs Error, xxx is not provided" if an input is not provided or blocks the yield', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* CounterToYield();
      },
    );

    TestBed.runInInjectionContext(() => {
      expect(() => injectCounterExtended()).toThrow(
        'Inputs Error, initialValue is not provided',
      );
    });
  });
  it('should provide a string token to say that the input is already provided', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'global' },
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter1 = yield* CounterToYield({ initialValue: signal(10) });
        // todobefore it is possible to yield the same service twice ?
        const counter2 = yield* CounterToYield({
          initialValue: 'Provided elsewhere #warn-check-docs:inputs',
        });

        return Object.assign(counter1, {
          incrementTwice: () => {
            counter1.increment();
            counter1.increment();
          },
          counter2,
        });
      },
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  it('should enable to yield a service with the scope function several times that will generate different instances', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter1 = yield* CounterToYield({
          initialValue: signal(10),
        });
        const counter2 = yield* CounterToYield({
          initialValue: signal(20),
        });

        return {
          counter1,
          counter2,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();
      expect(counterHandler.counter1()).toBe(10);
      counterHandler.counter1.increment();
      expect(counterHandler.counter1()).toBe(11);
      expect(counterHandler.counter2()).toBe(20);
      counterHandler.counter2.increment();
      expect(counterHandler.counter2()).toBe(21);
    });
  });
});

describe('injectService/ServiceToYield should expose an optional parameter that can be used to only expose what is needed and yield* dep must be used to declare non exposed fields. “Any dependency that is used but not exposed must be yielded (with yield*) in order to be counted.”', () => {
  it('should enable to use only some exposed field when using injectCounter', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        state(10, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounter({}, (counter) => ({
        increment: counter.increment,
      }));

      //@ts-expect-error decrement should not be accessible because it is not exposed
      counterHandler.decrement;

      expect('decrement' in counterHandler).toBe(false);
      expect(counterHandler()).toBe(10);
      counterHandler.increment();
      expect(counterHandler()).toBe(11);
    });
  });

  it('should enable to track hidden dependencies when using injectCounter', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () => {
        const counter = state(10, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        }));

        return {
          state: counter,
          increment: counter.increment,
          decrement: counter.decrement,
        };
      },
    );

    TestBed.runInInjectionContext(() => {
      const triggerDecrementObservable = new Subject<void>();
      const counterHandler = injectCounter(
        {},
        function* ({ state, increment }, { decrement }) {
          const decrementRef = yield* decrement();
          triggerDecrementObservable.subscribe(() => decrementRef());

          return {
            state,
            increment,
          };
        },
      );

      //@ts-expect-error decrement should not be accessible because it is not exposed
      counterHandler.decrement;

      expect('decrement' in counterHandler).toBe(false);
      expect(counterHandler.state()).toBe(10);
      counterHandler.increment();
      expect(counterHandler.state()).toBe(11);
      triggerDecrementObservable.next();
      expect(counterHandler.state()).toBe(10);
    });
  });

  it('should enable to track hidden dependencies from ServiceToYield', () => {
    const triggerDecrementObservable = new Subject<void>();

    const { CounterToYield } = service(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) => {
        const counter = state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        }));

        return {
          state: counter,
          increment: counter.increment,
          decrement: counter.decrement,
        };
      },
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        return yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          function* ({ state, increment }, { decrement }) {
            const decrementRef = yield* decrement();
            triggerDecrementObservable.subscribe(() => decrementRef());

            return {
              state,
              increment,
            };
          },
        );
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();

      //@ts-expect-error decrement should not be accessible because it is not exposed
      counterHandler.decrement;

      expect('decrement' in counterHandler).toBe(false);
      expect(counterHandler.state()).toBe(10);
      counterHandler.increment();
      expect(counterHandler.state()).toBe(11);
      triggerDecrementObservable.next();
      expect(counterHandler.state()).toBe(10);
    });
  });

  it('should enable to use only some exposed field when using CounterToYield', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'function' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const partialCounter = yield* CounterToYield(
          {
            initialValue: signal(10),
          },
          (counter) => ({
            state: counter,
            increment: counter.increment,
          }),
        );

        //@ts-expect-error decrement should not be accessible because it is not exposed
        partialCounter.decrement;

        return partialCounter;
      },
    );

    TestBed.runInInjectionContext(() => {
      const counterHandler = injectCounterExtended();

      expect('decrement' in counterHandler).toBe(false);
      expect(counterHandler()).toBe(10);
      expect(counterHandler.state()).toBe(10);
      counterHandler.increment();
      expect(counterHandler()).toBe(11);
      expect(counterHandler.state()).toBe(11);
    });
  });
});

describe('typing can track all dependencies (direct and child dependencies)', () => {
  it('should enable to track injectCounter scope', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    type CounterDependencies = GetInjectedServiceDependencies<injectCounter>; // todo create GetInjectedServiceDependencies and return a ServiceDependencies

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      dependencies: {};
      manuallyProvidedAtRoot: [];
    }>();
  });

  it('should enable to track injectCounterExtended dependencies', () => {
    const { CounterToYield } = service(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const partialCounter = yield* CounterToYield({
          initialValue: signal(10),
        });

        return partialCounter;
      },
    );

    type CounterDependencies =
      GetInjectedServiceDependencies<injectCounterExtended>;

    expectTypeOf<CounterDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      dependencies: {
        Counter: {
          scope: 'toProvide';
          dependencies: {};
          manuallyProvidedAtRoot: [];
        };
      };
      manuallyProvidedAtRoot: [];
    }>();
  });

  it('should enable to track dependencies of a ServiceToYield', () => {
    const { ManuallyProvidedAtRoot1ToYield } = service(
      { name: 'ManuallyProvidedAtRoot1', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    type ManuallyProvidedAtRoot1ToYieldDependencies =
      GetToYieldServiceDependencies<ManuallyProvidedAtRoot1ToYield>; // todo create GetToYieldServiceDependencies and return a ServiceDependencies

    expectTypeOf<ManuallyProvidedAtRoot1ToYieldDependencies>().toEqualTypeOf<{
      scope: 'manuallyProvidedAtRoot';
      dependencies: {};
      manuallyProvidedAtRoot: [];
    }>();
  });

  it('should enable to track child dependencies of injectCounterExtended', () => {
    const { ManuallyProvidedAtRoot1ToYield } = service(
      { name: 'ManuallyProvidedAtRoot1', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(0, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { ManuallyProvidedAtRoot2ToYield } = service(
      { name: 'ManuallyProvidedAtRoot2', scope: 'manuallyProvidedAtRoot' },
      () =>
        state(100, ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { CounterToYield } = service(
      { name: 'Counter', scope: 'toProvide' },
      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: () => update((v) => v + 1),
          decrement: () => update((v) => v - 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        const manuallyProvidedAtRoot1 = yield* ManuallyProvidedAtRoot1ToYield();
        const manuallyProvidedAtRoot2 = yield* ManuallyProvidedAtRoot2ToYield();
        const partialCounter = yield* CounterToYield({
          initialValue: signal(10),
        });

        return {
          partialCounter,
          manuallyProvidedAtRoot1,
          manuallyProvidedAtRoot2,
        };
      },
    );

    type CounterExtendedDependencies =
      GetInjectedServiceDependencies<injectCounterExtended>;

    expectTypeOf<CounterExtendedDependencies>().toEqualTypeOf<{
      scope: 'toProvide';
      dependencies: {
        ManuallyProvidedAtRoot1: {
          scope: 'manuallyProvidedAtRoot';
          dependencies: {};
          manuallyProvidedAtRoot: [];
        };
        ManuallyProvidedAtRoot2: {
          scope: 'manuallyProvidedAtRoot';
          dependencies: {};
          manuallyProvidedAtRoot: [];
        };
        Counter: {
          scope: 'toProvide';
          dependencies: {};
          manuallyProvidedAtRoot: [];
        };
      };
      manuallyProvidedAtRoot: [
        'ManuallyProvidedAtRoot1',
        'ManuallyProvidedAtRoot2',
      ];
    }>();
  });

  // todo later cas derived
});

// todo later
describe('typing can track all derived dependencies (only the properties that are derived/used) for direct and child dependencies', () => {});

describe.todo('contract à implémenter pour les services');

// todo later
describe.todo('compose/inject'); // todo tester si un composant override un provider si c'est bien résolu...

// todo later a "compose" helper that merge several services ?

// todo later
describe.todo(
  'testing exposing a public with symbol to know the deps and what to mock',
);

// todo later
describe.todo('enable inject options'); // handle optional params to expose....

// todo later queryparams, penser à des Symbol qui force à faire des merges, et pas à spread pour qu'on puisse les garder et les concaténer ?

// todo later injectService.explicit + eslint pour connaître toutes les deps d'une injection déclarative ?
// readonly counter = injectCounter.explicit({initialValueRef: this.initialValue}, ({initialValueRef}) => ({ inputs:  {initialValue: initialValueRef}}})); // with a type that force to handle all the deps, and if a new dep is added in the service, it will throw an error until it's handled in the explicit call

// todo later with option like skipHost/optional
