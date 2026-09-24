import {
  button,
  craftComponent,
  div,
  forNode,
  p,
  section,
  span,
  heading,
} from '@craft-ts/component';
import {
  craftComputed,
  craftRegisterFor,
  craftService,
  state,
} from '@craft-ts/core';
import { example } from '../shared/example.style';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((v) => v + 1),
      decrement: () => update((v) => v - 1),
    }));

    return counter;
  },
);

const CounterChild = craftComponent(
  'CounterChild',
  {
    providers: [provideCounter()],
  },
  function* () {
    const counter = yield* Counter();
    return { counter };
  },
  ({ counter }) =>
    div({ class: example.box }, [
      span({ class: example.subtitle }, counter),
      div({ class: example.row }, [
        button('decrement', { class: example.button, type: 'button', 'aria-label': 'Decrement', click: counter.decrement }, '-'),
        button('increment', { class: example.button, type: 'button', 'aria-label': 'Increment', click: counter.increment }, '+'),
      ]),
    ]),
);

const { RegisterForCounterChild, provideRegisterForCounterChild } =
  craftRegisterFor('CounterChild', CounterChild, ({ CounterChild }) => ({
    total: craftComputed('total', () => CounterChild()?.length ?? 0),
    incrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.counter.increment()),
    decrementAllChildCounter: () =>
      CounterChild()?.forEach(({ ref }) => ref.counter.decrement()),
  }));

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  Counter,
  ({ Counter }) => ({
    total: craftComputed('total', () => Counter()?.length ?? 0),
  }),
);

const RegisterForDemo = craftComponent(
  'RegisterForDemo',
  {
    providers: [provideRegisterForCounterChild(), provideRegisterForCounter()],
  },
  function* () {
    const counterChildIds = yield* state(
      'counterChildIds',
      [1, 2, 3],
      ({ update }) => ({
        addChild: () =>
          update((ids) => [
            ...ids,
            (ids.length === 0 ? 0 : (ids[ids.length - 1] ?? 0)) + 1,
          ]),
        removeChild: () => update((ids) => ids.slice(0, -1)),
      }),
    );

    const childComponents = yield* RegisterForCounterChild();
    const counterTotal = yield* RegisterForCounter.total();
    const childTotal = craftComputed('childTotal', function* () {
        const _childComponentstotal = yield* childComponents.total(); return _childComponentstotal; },
    );
    const serviceTotal = craftComputed('serviceTotal', function* () {
        const _counterTotal = yield* counterTotal(); return _counterTotal; },
    );

    return {
      counterChildIds,
      childComponents,
      childTotal,
      serviceTotal,
    };
  },
  ({ counterChildIds, childComponents, childTotal, serviceTotal }) =>
    section({ class: example.card }, [
      heading({ class: example.title }, 'craftRegisterFor: control child counters'),
      p(
        'The parent observes the Counter instances created in its children. Removing a child also removes its registration.',
      ),
      div({ class: example.row }, [
        button('incrementAll',
          { class: example.button, type: 'button', click: childComponents.incrementAllChildCounter },
          'Increment all',
        ),
        button('decrementAll',
          { class: example.button, type: 'button', click: childComponents.decrementAllChildCounter },
          'Decrement all',
        ),
        button('addChild', { class: example.button, type: 'button', click: counterChildIds.addChild }, 'Add a child'),
        button('removeChild', { class: example.button, type: 'button', click: counterChildIds.removeChild }, 'Remove a child'),
        span(
          { class: example.hint },
          function* () {
            return `services: ${yield* serviceTotal()} · components: ${yield* childTotal()}`;
          },
        ),
      ]),
      div(
        { class: example.tiles },
        forNode(counterChildIds, { track: (id) => id }, () => CounterChild({})),
      ),
    ]),
);

export default RegisterForDemo;
