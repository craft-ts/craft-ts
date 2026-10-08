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
  craftUse,
  craftExpose,
} from '@craft-ts/core';
import { example } from '../shared/example.style';

const { Counter, provideCounter } = craftService(
  { name: 'Counter', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ update }) => ({
      increment: () => update((v) => v + 1),
      decrement: () => update((v) => v - 1),
    }));
  },
);

export const { CounterChildView, provideCounterChildView } = craftService(
  { name: 'counterChildView', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('counter', (yield* Counter()).counter);
  },
);

const CounterChild = craftComponent(
  'CounterChild',
  {
    providers: [provideCounterChildView(), provideCounter()],
  },
  () => div({ class: example.box }, [
      span({ class: example.subtitle }, CounterChildView.counter),
      div({ class: example.row }, [
        button('decrement', { class: example.button, type: 'button', 'aria-label': 'Decrement', click: CounterChildView.counter.decrement }, '-'),
        button('increment', { class: example.button, type: 'button', 'aria-label': 'Increment', click: CounterChildView.counter.increment }, '+'),
      ]),
    ]),
);

// The component itself exposes no instance any more: what the parent wants to
// reach is the counter each child provides, so the registration is on the
// service.
const { RegisterForCounterChild, provideRegisterForCounterChild } =
  craftRegisterFor('CounterChild', CounterChild, ({ CounterChild }) => ({
    total: craftUse(craftComputed('total', () => CounterChild()?.length ?? 0)),
  }));

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  Counter,
  ({ Counter }) => ({
    total: craftUse(craftComputed('total', () => Counter()?.length ?? 0)),
    incrementAllChildCounter: () =>
      Counter()?.forEach(({ ref }) => ref.counter.increment()),
    decrementAllChildCounter: () =>
      Counter()?.forEach(({ ref }) => ref.counter.decrement()),
  }),
);

export const { RegisterForDemoView, provideRegisterForDemoView } = craftService(
  { name: 'registerForDemoView', providedIn: 'toProvide' },
  function* () {
    yield* state(
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
    const counters = yield* RegisterForCounter();
    const counterTotal = counters.total;
    yield* craftComputed('childTotal', function* () {
      const _childComponentstotal = yield* childComponents.total();
      return _childComponentstotal;
    });
    yield* craftComputed('serviceTotal', function* () {
      const _counterTotal = yield* counterTotal();
      return _counterTotal;
    });

    yield* craftExpose('childComponents', childComponents);
    yield* craftExpose('counters', counters);
  },
);

const RegisterForDemo = craftComponent(
  'RegisterForDemo',
  {
    providers: [
      provideRegisterForDemoView(),
      provideRegisterForCounterChild(),
      provideRegisterForCounter(),
    ],
  },
  () => section({ class: example.card }, [
        heading({ class: example.title }, 'craftRegisterFor: control child counters'),
        p(
          'The parent observes the Counter instances created in its children. Removing a child also removes its registration.',
        ),
        div({ class: example.row }, [
          button('incrementAll',
            { class: example.button, type: 'button', click: RegisterForDemoView.counters.incrementAllChildCounter },
            'Increment all',
          ),
          button('decrementAll',
            { class: example.button, type: 'button', click: RegisterForDemoView.counters.decrementAllChildCounter },
            'Decrement all',
          ),
          button('addChild', { class: example.button, type: 'button', click: RegisterForDemoView.counterChildIds.addChild }, 'Add a child'),
          button('removeChild', { class: example.button, type: 'button', click: RegisterForDemoView.counterChildIds.removeChild }, 'Remove a child'),
          span(
            { class: example.hint },
            function* () {
              return `services: ${yield* RegisterForDemoView.serviceTotal()} · components: ${yield* RegisterForDemoView.childTotal()}`;
            },
          ),
        ]),
        div(
          { class: example.tiles },
          forNode(
            function* () {
              const { counterChildIds } = yield* RegisterForDemoView();
              return yield* counterChildIds();
            },
            { track: (id) => id },
            () => CounterChild({}),
          ),
        ),
      ]),
);

export default RegisterForDemo;
