import { TestBed } from '@angular/core/testing';
import { state } from './state';
import { signal } from '@angular/core';

// todoBefore name du service faire que ce soit un object name/scope pour éviter des galères de typage poiur commencer
// todoBefore analyser les testes pour les corriger si besoin
// todoBefore mettre des #error-check-docs:inputs dans les tests pour faire le lien avec la doc et éviter les confusions
describe('service', () => {
  it('should enable to create a service-like using service and inject it.', () => {
    const { injectCounter } = service('Counter', () =>
      state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
    );

    TestBed.runInInjectionContext(() => {
      const counter = injectCounter();
      expect(counter()).toBe(0);
      counter.increment();
      expect(counter()).toBe(1);
    });
  });

  it('should enable to yield another service', () => {
    const { CounterToYield } = service('Counter', () =>
      state(0, ({ update }) => ({ increment: update((v) => v + 1) })),
    );

    const { injectCounterExtended } = service('CounterExtended', function* () {
      const counter = yield* CounterToYield();

      return {
        ...counter,
        incrementTwice: () => {
          counter.increment();
          counter.increment();
        },
      };
    });

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
    const { injectCounter } = service('Counter', () =>
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

  // ? Ne prend pas en compte: with scope function can yield inside, and his scope become 'local' if their is a yield of a service toProvide,
});

describe('injectService should enable to binding inputs', () => {
  // todo convention à la MaybeSignal (créer un utilitaire dédié ?)
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

    const { injectCounterExtended } = service('CounterExtended', function* () {
      const counter = yield* CounterToYield({ initialValue: 10 });

      return {
        ...counter,
        incrementTwice: () => {
          counter.increment();
          counter.increment();
        },
      };
    });

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

    const { injectCounterExtended } = service('CounterExtended', function* () {
      const counter = yield* CounterToYield({ initialValue: signal(10) });

      return {
        ...counter,
        incrementTwice: () => {
          counter.increment();
          counter.increment();
        },
      };
    });

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

    const { injectCounterExtended } = service('CounterExtended', function* () {
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
    });

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

    const { injectCounterExtended } = service('CounterExtended', function* () {
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
    });

    TestBed.runInInjectionContext(() => {
      const counter = injectCounterExtended();
      expect(counter()).toBe(10);
      counter.increment();
      expect(counter()).toBe(11);
      counter.incrementTwice();
      expect(counter()).toBe(13);
    });
  });

  // todo cas où on yield 2 fois un service fonction (ça devrait faire 2 instances différentes, mais avec les mêmes inputs)
});

// todobefore gérer les cas quand on yield plusieurs fois le même service global/toProvide qui doivent rester la même instances & function qui doit en renvoyer plusieurs

describe.todo(
  'injectService/ServiceToYield should expose an optional parameter that can be used to only expose what is needed and yield* dep must be used to declare non exposed fields',
); // todo injectService/ServiceToYield with second param to only expose what is needed

describe.todo('contract à implémenter pour les services');
describe.todo('yield typage'); // with option like skipHost/optional
// todo renvoyer une erreur si un yield d'un service à fournir est fait dans un service global (pas de host pour résoudre la dépendance)

// todo inject/...toYield avec second paramètre pour savoir et exposer uniquement ce qu'il y a beosin
// const counter = yield* CounterToYield(function* ({increment, state}) => {
// const increment = yield* increment;
// const state = yield* state;
//. return {increment, state}
// });
//});
// “Toute dépendance utilisée mais non exposée doit être yield*ée pour être comptée.”

describe.todo('compose/inject'); // todo tester si un composant override un provider si c'est bien résolu...

describe.todo(
  'testing exposing a public with symbol to know the deps and what to mock',
);

describe.todo('enable inject options'); // handle optional params to expose....
