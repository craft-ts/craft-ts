import { TestBed } from '@angular/core/testing';
import { state } from './state';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';

// todoBefore analyser les testes pour les corriger si besoin
// todoBefore mettre des #error-check-docs:inputs dans les tests pour faire le lien avec la doc et éviter les confusions
// todo add contexte et dire qu'il doit absolument résoudre via inject d'anular
describe('service', () => {
  it('should enable to create a service-like using service and inject it.', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();

        return {
          ...counter,
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        };
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

  // todo trhow error if yield a service toProvide in a global

  // todo eslint rule to block inject inside service
});
describe.todo('scope', () => {
  it('should enable to create a global service by just passing a name', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () =>
        // todo force to always add a scope (esaier for type, after that try to only pass the name)
        state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
    );

    expect(provideCounter).toBeUndefined();
  });

  // todo global service should not expose provideService

  it('should enable to create a global service by passing a name/scope', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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
    // the aim of this scope is to enable to inject it in global services but it force to provide it manually for testes
    const { injectCounter, provideCounter } = service(
      { name: 'Counter', scope: 'manuallyProvidedAtRoot' },
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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

  it('should enable to create a function service by passing a name/scope (mostly used for reusability and composition/inputs...)', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'function' },
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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
    const { injectCounter, provideCounter } = service(
      { name: 'Counter', scope: 'abstract' },
      abstract<Counter>(), // todo create abstract helper that just return the type and do nothing else, to be used for abstract service
    );

    expectTypeOf(injectCounter).toEqualTypeOf<() => Counter>();
    expect(injectCounter).toBeDefined();

    //@ts-expect-error provideCounter should not be defined because it's an abstract service, an implementation service should provide through requirement CounterRequirement
    expect(provideCounter).toBeDefined();
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
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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
    const { injectCounterImpl, provideCounterImpl } = service(
      {
        name: 'CounterImpl',
        scope: 'global',
        requirement: CounterRequirement,
      },
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
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
    const { injectCounterImpl, provideCounterImpl } = service(
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
      () => state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
    );

    //@ts-expect-error it should not be possible to create a global service that depends on a toProvide service because the dependency cannot be resolved, it should force to provide the service in the test or use manuallyProvidedAtRoot for the service that need to be yield in a global service
    const { injectGlobalCounter } = service(
      { name: 'GlobalCounter', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield();
        return counter;
      },
    );
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
          increment: update((v) => v + 1),
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
          increment: update((v) => v + 1),
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
          increment: update((v) => v + 1),
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
          increment: update((v) => v + 1),
        })),
    );

    TestBed.runInInjectionContext(() => {
      // todo make a test that force to pass an input, and if it's not passed, throw an error
      const counter = injectCounter();
      // expect error to be thrown or a string to be returned
      expectTypeOf(
        counter,
      ).toEqualTypeOf<'Inputs Error, initialValue is not provided'>();
    });
  });
  it('should provide a string token to say that the input is already provided', () => {
    const { injectCounter } = service(
      { name: 'Counter', scope: 'global' },
      // ! inputs can only be set in the first params

      (inputs: { initialValue: MaybeSignal<number> }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: update((v) => v + 1),
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
      'Counter',
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({ initialValue: 10 });

        return {
          ...counter,
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        };
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
      'Counter',
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({ initialValue: signal(10) });

        return {
          ...counter,
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        };
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
      'Counter',
      (inputs: {
        initialValue: MaybeSignal<number>;
        optionalProperty1?: MaybeSignal<number>; // todo create MaybeSignal
        optionalProperty2?: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        const counter = yield* CounterToYield({
          initialValue: signal(10),
          optionalProperty1: signal(20),
        });

        return {
          ...counter,
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        };
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
      'Counter',
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: update((v) => v + 1),
        })),
    );

    const { injectCounterExtended } = service(
      { name: 'CounterExtended', scope: 'global' },
      function* () {
        //@ts-expect-error it should not be possible to yield if an input is not provided, it should throw an error or return a string error
        const counter = yield* CounterToYield();

        // The aim is to show that something went wrong because the input is not provided
        // if possible return a string error that can be easily identifiable in the test to avoid confusion with other errors
        // otherwise it is enough if their is a typescript error when yield
        expectTypeOf(
          counter,
        ).toEqualTypeOf<'Inputs Error, initialValue is not provided #error-check-docs:inputs'>();

        return {
          ...counter,
          incrementTwice: () => {
            counter.increment();
            counter.increment();
          },
        };
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
  it('should provide a string token to say that the input is already provided', () => {
    const { CounterToYield } = service(
      'Counter',
      (inputs: {
        initialValue: MaybeSignal<number>; // todo create MaybeSignal
      }) =>
        state(toValue(inputs.initialValue), ({ update }) => ({
          increment: update((v) => v + 1),
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

        return {
          ...counter1,
          incrementTwice: () => {
            counter1.increment();
            counter1.increment();
          },
          counter2,
        };
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
          increment: update((v) => v + 1),
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

// todo later & typage
describe.todo(
  'injectService/ServiceToYield should expose an optional parameter that can be used to only expose what is needed and yield* dep must be used to declare non exposed fields. “Any dependency that is used but not exposed must be yielded (with yield*) in order to be counted.”',
  () => {
    // ! limitation, state return a signal and that looks weird to expose it and his methods separately, maybe we can have a helper to do that automatically for state ? or maybe it's not a problem and it can be used like that, but it is something to think about for the ergonomics of the API
    it('should enable to use only some exposed field when using injectCounterExtended', () => {
      const { injectCounterExtended } = service(
        'CounterExtended',
        function* () {
          return state(10, ({ update }) => ({
            increment: update((v) => v + 1),
            decrement: update((v) => v - 1),
          }));
        },
      );

      TestBed.runInInjectionContext(() => {
        const counterHandler = injectCounterExtended({}, (counter) => ({
          increment: counter.increment,
          // decrement is not exposed
        }));

        //@ts-expect-error decrement should not be accessible because it's not exposed in the second parameter of injectCounterExtended
        counterHandler.decrement();

        expect(counterHandler()).toBe(10);
        counterHandler.increment();
        expect(counterHandler()).toBe(11);
      });
    });

    it('should enable to track all used fields', () => {
      const { injectCounterExtended } = service(
        { name: 'CounterExtended', scope: 'global' },
        () => {
          return state(10, ({ update, state }) => ({
            increment: update((v) => v + 1),
            decrement: update((v) => v - 1),
            state,
          }));
        },
      );

      TestBed.runInInjectionContext(() => {
        const triggerDecrementObservable = new Subject<void>();
        const counterHandler = injectCounterExtended(
          {},
          function* ({ state, increment, decrement }) {
            const decrementRef = yield* decrement(); // we need to yield* it to be able to track it and know that it's used in the service, even if it's not exposed
            triggerDecrementObservable.subscribe(() => decrementRef());
            return {
              state,
              increment,
            };
          },
        );

        //@ts-expect-error decrement should not be accessible because it's not exposed in the second parameter of injectCounterExtended
        counterHandler.decrement();

        expect(counterHandler.state()).toBe(10);
        counterHandler.increment();
        expect(counterHandler.state()).toBe(11);
        triggerDecrementObservable.next();
        expect(counterHandler.state()).toBe(10);
      });
    });

    it('should enable to track all used fields from ServiceToYield', () => {
      const { CounterToYield } = service(
        { name: 'Counter', scope: 'function' },
        (inputs: { initialValue: MaybeSignal<number> }) =>
          state(toValue(inputs.initialValue), ({ update }) => ({
            increment: update((v) => v + 1),
            decrement: update((v) => v - 1),
            state: toValue(inputs.initialValue),
          })),
      );

      const triggerDecrementObservable = new Subject<void>();

      const { injectCounterExtended } = service(
        'CounterExtended',
        function* () {
          const counter = yield* CounterToYield(
            {
              initialValue: signal(10),
            },
            function* ({ state, increment, decrement }) {
              const decrementRef = yield* decrement(); // we need to yield* it to be able to track it and know that it's used in the service, even if it's not exposed
              triggerDecrementObservable.subscribe(() => decrementRef());
              return {
                increment,
                state,
              };
            },
          );
          return counter;
        },
      );

      TestBed.runInInjectionContext(() => {
        const triggerDecrementObservable = new Subject<void>();
        const counterHandler = injectCounterExtended();

        //@ts-expect-error decrement should not be accessible because it's not exposed in the second parameter of injectCounterExtended
        counterHandler.decrement();

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
            increment: update((v) => v + 1),
            decrement: update((v) => v - 1),
          })),
      );

      const { injectCounterExtended } = service(
        'CounterExtended',
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

          //@ts-expect-error decrement should not be accessible because it's not exposed in the second parameter of CounterToYield
          partialCounter.decrement();

          expect(partialCounter.state()).toBe(10);

          return partialCounter;
        },
      );

      TestBed.runInInjectionContext(() => {
        const counterHandler = injectCounterExtended();
        expect(counterHandler()).toBe(10);
        counterHandler.increment();
        expect(counterHandler()).toBe(11);
      });
    });

    // todo later improve typing to check that only the exposed fields are accessible in the yield* and if a non exposed field is used, it should throw a typescript error
  },
);

describe.todo('contract à implémenter pour les services');

// todo later
describe.todo('yield typage'); // with option like skipHost/optional
// todo renvoyer une erreur si un yield d'un service à fournir est fait dans un service global (pas de host pour résoudre la dépendance)

// todo later
describe.todo('compose/inject'); // todo tester si un composant override un provider si c'est bien résolu...

// todo later
describe.todo(
  'testing exposing a public with symbol to know the deps and what to mock',
);

// todo later
describe.todo('enable inject options'); // handle optional params to expose....

// todo later queryparams, penser à des Symbol qui force à faire des merges, et pas à spread pour qu'on puisse les garder et les concaténer ?

// todo later injectService.explicit + eslint pour connaître toutes les deps d'une injection déclarative ?
// readonly counter = injectCounter.explicit({initialValueRef: this.initialValue}, ({initialValueRef}) => ({ inputs:  {initialValue: initialValueRef}}})); // with a type that force to handle all the deps, and if a new dep is added in the service, it will throw an error until it's handled in the explicit call
